from __future__ import annotations

import logging
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Optional

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from utils.text_utils import clean_text

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class SimilarityConfig:
    """Tuneable parameters for the similarity pipeline."""

    # TF-IDF
    ngram_range: tuple[int, int] = (1, 2)
    max_features: Optional[int] = 20_000      # cap vocabulary to control memory
    sublinear_tf: bool = True                  # log-normalise term frequencies

    # Ensemble weights (must sum to 1.0)
    tfidf_weight: float = 0.6
    keyword_weight: float = 0.4

    # Keyword matching
    min_keyword_len: int = 3                   # ignore very short tokens
    top_k_keywords: int = 30                   # JD keywords to match against

    # Cache
    lru_maxsize: int = 512


_DEFAULT_CONFIG = SimilarityConfig()


# ---------------------------------------------------------------------------
# Result type
# ---------------------------------------------------------------------------

@dataclass
class SimilarityResult:
    """Detailed breakdown returned by :func:`similarity_score`."""

    score: int                         # 0-100, final blended score
    tfidf_score: int                   # cosine-similarity component
    keyword_score: int                 # keyword-overlap component
    matched_keywords: list[str] = field(default_factory=list)
    missing_keywords: list[str] = field(default_factory=list)

    def __str__(self) -> str:          # pragma: no cover
        return (
            f"Score={self.score} "
            f"(tfidf={self.tfidf_score}, keyword={self.keyword_score}) | "
            f"matched={len(self.matched_keywords)}, "
            f"missing={len(self.missing_keywords)}"
        )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _normalize_score(value: float) -> int:
    """Clamp *value* to [0, 100] and round to the nearest integer."""
    return int(round(max(0.0, min(100.0, value))))


def _extract_keywords(text: str, top_k: int, min_len: int) -> list[str]:
    """
    Return the *top_k* most informative unigrams from *text* using TF-IDF
    weights on a single document (i.e. term-frequency only after stop-word
    removal).  Tokens shorter than *min_len* characters are discarded.
    """
    if not text:
        return []

    vectorizer = TfidfVectorizer(
        stop_words="english",
        ngram_range=(1, 1),
        sublinear_tf=True,
        min_df=1,
    )
    try:
        tfidf_matrix = vectorizer.fit_transform([text])
    except ValueError:
        return []

    terms = np.array(vectorizer.get_feature_names_out())
    scores = np.asarray(tfidf_matrix.todense()).flatten()

    # Filter by minimum length then take top-k by score
    mask = np.array([len(t) >= min_len for t in terms])
    filtered_terms = terms[mask]
    filtered_scores = scores[mask]

    if filtered_terms.size == 0:
        return []

    top_indices = np.argsort(filtered_scores)[::-1][:top_k]
    return filtered_terms[top_indices].tolist()


def _keyword_overlap(
    resume_text: str,
    jd_keywords: list[str],
) -> tuple[int, list[str], list[str]]:
    """
    Compute how many of *jd_keywords* appear in *resume_text*.

    Returns
    -------
    score : int
        0-100 keyword-overlap score.
    matched : list[str]
    missing : list[str]
    """
    if not jd_keywords:
        return 0, [], []

    resume_words = set(resume_text.lower().split())
    matched = [kw for kw in jd_keywords if kw in resume_words]
    missing = [kw for kw in jd_keywords if kw not in resume_words]

    raw_score = len(matched) / len(jd_keywords) * 100
    return _normalize_score(raw_score), matched, missing


# ---------------------------------------------------------------------------
# Cached inner function
# ---------------------------------------------------------------------------

@lru_cache(maxsize=_DEFAULT_CONFIG.lru_maxsize)
def _cached_similarity(
    cleaned_resume_text: str,
    cleaned_jd_text: str,
    config: SimilarityConfig = _DEFAULT_CONFIG,
) -> SimilarityResult:
    """
    Core computation, memoised on the *cleaned* texts so identical inputs
    never recompute.  The cache key intentionally excludes the raw originals
    to maximise hit-rate after normalisation.
    """
    if not cleaned_resume_text or not cleaned_jd_text:
        logger.debug("Empty input detected – returning zero score.")
        return SimilarityResult(score=0, tfidf_score=0, keyword_score=0)

    # ── TF-IDF cosine similarity ──────────────────────────────────────────
    try:
        vectorizer = TfidfVectorizer(
            stop_words="english",
            ngram_range=config.ngram_range,
            max_features=config.max_features,
            sublinear_tf=config.sublinear_tf,
        )
        matrix = vectorizer.fit_transform([cleaned_resume_text, cleaned_jd_text])
        raw_tfidf = float(cosine_similarity(matrix[0:1], matrix[1:2])[0][0])
    except Exception:
        logger.exception("TF-IDF computation failed; defaulting tfidf_score to 0.")
        raw_tfidf = 0.0

    tfidf_score = _normalize_score(raw_tfidf * 100)

    # ── Keyword overlap ───────────────────────────────────────────────────
    jd_keywords = _extract_keywords(
        cleaned_jd_text,
        top_k=config.top_k_keywords,
        min_len=config.min_keyword_len,
    )
    keyword_score, matched, missing = _keyword_overlap(cleaned_resume_text, jd_keywords)

    # ── Ensemble ──────────────────────────────────────────────────────────
    blended = (
        config.tfidf_weight * tfidf_score
        + config.keyword_weight * keyword_score
    )
    final_score = _normalize_score(blended)

    logger.debug(
        "Similarity computed: final=%d tfidf=%d keyword=%d "
        "matched_keywords=%d missing_keywords=%d",
        final_score, tfidf_score, keyword_score, len(matched), len(missing),
    )

    return SimilarityResult(
        score=final_score,
        tfidf_score=tfidf_score,
        keyword_score=keyword_score,
        matched_keywords=matched,
        missing_keywords=missing,
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def similarity_score(
    resume_text: str,
    jd: str,
    config: SimilarityConfig = _DEFAULT_CONFIG,
    *,
    detailed: bool = False,
) -> int | SimilarityResult:
    """
    Compute a 0-100 similarity score between a résumé and a job description.

    Parameters
    ----------
    resume_text:
        Raw résumé text.
    jd:
        Raw job-description text.
    config:
        Optional :class:`SimilarityConfig` to override defaults.
    detailed:
        When ``True`` return the full :class:`SimilarityResult` instead of
        just the integer score.

    Returns
    -------
    int
        Final blended score (default).
    SimilarityResult
        Full breakdown when ``detailed=True``.
    """
    cleaned_resume = clean_text(resume_text)
    cleaned_jd = clean_text(jd)
    result = _cached_similarity(cleaned_resume, cleaned_jd, config)
    return result if detailed else result.score