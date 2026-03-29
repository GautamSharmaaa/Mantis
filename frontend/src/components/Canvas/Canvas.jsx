import React, { memo } from "react";

function readSelection(value, event) {
  const target = event?.target;
  if (
    target &&
    typeof target.selectionStart === "number" &&
    typeof target.selectionEnd === "number" &&
    target.selectionStart !== target.selectionEnd
  ) {
    return value.slice(target.selectionStart, target.selectionEnd).trim();
  }

  if (typeof window !== "undefined") {
    return window.getSelection?.()?.toString().trim() || "";
  }

  return "";
}

function selectionLabel(meta) {
  if (!meta) {
    return "Select any bullet or section";
  }

  if (meta.field === "bullet") {
    return `Editing: ${meta.section === "project" ? "Project" : "Experience"} → Bullet`;
  }

  if (meta.section === "summary") {
    return "Editing: Summary";
  }

  if (meta.section === "skills") {
    return "Editing: Skills";
  }

  return `Editing: ${meta.field || meta.section}`;
}

const SectionHeading = memo(function SectionHeading({ children, actions = null }) {
  return (
    <div className="resume-section-heading">
      <div className="resume-section-heading__label">
        <span>{children}</span>
      </div>
      <i />
      {actions ? <div className="resume-section-heading__actions">{actions}</div> : null}
    </div>
  );
});

const BulletRow = memo(function BulletRow({
  section,
  itemIndex,
  bulletIndex,
  bullet,
  selectionMeta,
  actionLoadingKey,
  onSelectText,
  onChange,
  onAction,
  onRemove,
  mode,
}) {
  const selected =
    selectionMeta?.section === section &&
    selectionMeta?.field === "bullet" &&
    selectionMeta?.itemIndex === itemIndex &&
    selectionMeta?.bulletIndex === bulletIndex;

  const busyPrefix = `${section}:${itemIndex}:${bulletIndex}:`;

  if (selected && mode !== "edit") {
    return (
      <div className="resume-bullet resume-bullet--active" onClick={() => onSelectText({ section, itemIndex, bulletIndex, field: "bullet" }, bullet)} role="button" tabIndex={0}>
        <div className="resume-bullet__content">
          <span className="resume-bullet__badge" aria-hidden="true">
            ↗
          </span>
          <span className="resume-bullet__text">{bullet}</span>
        </div>
        <div className="resume-bullet__actions">
          <button
            disabled={actionLoadingKey.startsWith(busyPrefix)}
            onClick={() => onAction(section, itemIndex, bulletIndex, "improve")}
            type="button"
          >
            {actionLoadingKey === `${busyPrefix}improve` ? "Improving..." : "✦ Improve"}
          </button>
          <button
            disabled={actionLoadingKey.startsWith(busyPrefix)}
            onClick={() => onAction(section, itemIndex, bulletIndex, "shorten")}
            type="button"
          >
            {actionLoadingKey === `${busyPrefix}shorten` ? "Shortening..." : "− Shorten"}
          </button>
          <button
            disabled={actionLoadingKey.startsWith(busyPrefix)}
            onClick={() => onAction(section, itemIndex, bulletIndex, "add-impact")}
            type="button"
          >
            {actionLoadingKey === `${busyPrefix}add-impact` ? "Adding..." : "+ Add Impact"}
          </button>
          <button className="resume-bullet__danger" onClick={() => onRemove(itemIndex, bulletIndex)} type="button">
            Delete
          </button>
        </div>
      </div>
    );
  }

  if (mode === "edit" && selected) {
    return (
      <div className="resume-bullet resume-bullet--active resume-bullet--editing">
        <textarea
          rows={2}
          value={bullet}
          onChange={(event) => onChange(event.target.value)}
          onSelect={(event) =>
            onSelectText(
              { section, itemIndex, bulletIndex, field: "bullet" },
              readSelection(bullet, event) || bullet,
            )
          }
          onFocus={() => onSelectText({ section, itemIndex, bulletIndex, field: "bullet" }, bullet)}
        />
        <div className="resume-bullet__actions">
          <button
            disabled={actionLoadingKey.startsWith(busyPrefix)}
            onClick={() => onAction(section, itemIndex, bulletIndex, "improve")}
            type="button"
          >
            {actionLoadingKey === `${busyPrefix}improve` ? "Improving..." : "Improve"}
          </button>
          <button
            disabled={actionLoadingKey.startsWith(busyPrefix)}
            onClick={() => onAction(section, itemIndex, bulletIndex, "shorten")}
            type="button"
          >
            {actionLoadingKey === `${busyPrefix}shorten` ? "Shortening..." : "Shorten"}
          </button>
          <button
            disabled={actionLoadingKey.startsWith(busyPrefix)}
            onClick={() => onAction(section, itemIndex, bulletIndex, "add-impact")}
            type="button"
          >
            {actionLoadingKey === `${busyPrefix}add-impact` ? "Adding..." : "Add Impact"}
          </button>
          <button className="resume-bullet__danger" onClick={() => onRemove(itemIndex, bulletIndex)} type="button">
            Delete
          </button>
        </div>
      </div>
    );
  }

  if (mode === "edit") {
    return (
      <div className="resume-bullet-row">
        <button
          className={`resume-bullet ${selected ? "resume-bullet--selected" : ""}`}
          onClick={() => onSelectText({ section, itemIndex, bulletIndex, field: "bullet" }, bullet)}
          type="button"
        >
          {bullet}
        </button>
        <button
          className="resume-bullet-row__remove"
          onClick={() => onRemove(itemIndex, bulletIndex)}
          type="button"
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <button
      className={`resume-bullet ${selected ? "resume-bullet--selected" : ""}`}
      onClick={() => onSelectText({ section, itemIndex, bulletIndex, field: "bullet" }, bullet)}
      type="button"
    >
      {bullet}
    </button>
  );
});

function buildFieldKey(meta) {
  return `${meta.section}:${meta.itemIndex ?? "x"}:${meta.field}`;
}

function ActionCard({ value, actionLoadingKey, busyPrefix, onAction, children }) {
  return (
    <div className="resume-bullet resume-bullet--active" role="button" tabIndex={0}>
      <div className="resume-bullet__content">
        <span className="resume-bullet__badge" aria-hidden="true">
          ↗
        </span>
        <div className="resume-bullet__text">{children || value}</div>
      </div>
      <div className="resume-bullet__actions">
        <button
          disabled={actionLoadingKey.startsWith(busyPrefix)}
          onClick={() => onAction("improve")}
          type="button"
        >
          {actionLoadingKey === `${busyPrefix}:improve` ? "Improving..." : "✦ Improve"}
        </button>
        <button
          disabled={actionLoadingKey.startsWith(busyPrefix)}
          onClick={() => onAction("shorten")}
          type="button"
        >
          {actionLoadingKey === `${busyPrefix}:shorten` ? "Shortening..." : "− Shorten"}
        </button>
        <button
          disabled={actionLoadingKey.startsWith(busyPrefix)}
          onClick={() => onAction("add-impact")}
          type="button"
        >
          {actionLoadingKey === `${busyPrefix}:add-impact` ? "Adding..." : "+ Add Impact"}
        </button>
      </div>
    </div>
  );
}

function EditableBlock({
  active,
  multiline = false,
  value,
  onChange,
  onSelectText,
  onAction,
  actionLoadingKey,
  meta,
  mode,
  className = "",
  placeholder = "",
}) {
  const busyPrefix = buildFieldKey(meta);
  const displayValue = value || placeholder;
  const empty = !value;

  if (active && mode !== "edit") {
    return (
      <ActionCard
        value={displayValue}
        actionLoadingKey={actionLoadingKey}
        busyPrefix={busyPrefix}
        onAction={(action) => onAction(meta, action, value || placeholder)}
      />
    );
  }

  if (active && mode === "edit") {
    if (multiline) {
      return (
        <textarea
          className={`resume-inline-input ${className}`.trim()}
          placeholder={placeholder}
          rows={4}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onSelect={(event) => onSelectText(meta, readSelection(value, event) || value)}
          onFocus={() => onSelectText(meta, value)}
        />
      );
    }

    return (
      <input
        className={`resume-inline-input ${className}`.trim()}
        placeholder={placeholder}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onSelect={(event) => onSelectText(meta, readSelection(value, event) || value)}
        onFocus={() => onSelectText(meta, value)}
      />
    );
  }

  const Tag = multiline ? "p" : "button";
  return (
    <Tag
      className={`resume-inline-text ${empty ? "resume-inline-text--empty" : ""} ${className}`.trim()}
      onClick={() => onSelectText(meta, value)}
      type={multiline ? undefined : "button"}
    >
      {displayValue}
    </Tag>
  );
}

const Canvas = memo(function Canvas({
  resume,
  profile,
  selectionMeta,
  actionLoadingKey,
  template,
  mode,
  previewPdfUrl,
  previewLoading,
  previewError,
  onToggleMode,
  onSelectText,
  onSummaryChange,
  onExperienceRoleChange,
  onExperienceCompanyChange,
  onExperienceBulletChange,
  onProjectNameChange,
  onProjectBulletChange,
  onSkillsChange,
  onAddExperience,
  onAddExperienceBullet,
  onAddProject,
  onAddProjectBullet,
  onRemoveExperience,
  onRemoveExperienceBullet,
  onRemoveProject,
  onRemoveProjectBullet,
  onBulletAction,
  onFieldAction,
  onClearSelection,
}) {
  if (!resume) {
    return <section className="workspace-canvas" />;
  }

  const skillsValue = resume.data.skills.join(", ");
  const totalBullets =
    resume.data.experience.reduce((count, item) => count + item.points.length, 0) +
    resume.data.projects.reduce((count, item) => count + item.points.length, 0);
  const contactLine = [profile.email, profile.phone, profile.location].filter(Boolean).join(" · ");
  const linkLine = [profile.website, profile.github, profile.linkedin]
    .filter(Boolean)
    .map((value) => value.replace(/^https?:\/\//, ""))
    .join(" · ");

  return (
    <section className={`workspace-canvas workspace-canvas--${template}`}>
      <div className="workspace-canvas__toolbar">
        <div className="workspace-canvas__toolbar-copy">
          <div className="workspace-canvas__editing-pill">
            {mode === "preview" ? "PDF preview" : selectionLabel(selectionMeta)}
          </div>
          <span className="workspace-canvas__toolbar-mode">
            {mode === "edit" ? "Edit mode active" : "Preview uses the exported PDF layout"}
          </span>
        </div>
        <div className="workspace-canvas__toolbar-actions">
          {selectionMeta ? (
            <button className="workspace-canvas__mode" onClick={onClearSelection} type="button">
              Clear selection
            </button>
          ) : null}
          <button className="workspace-canvas__mode" onClick={() => onToggleMode(mode === "edit" ? "preview" : "edit")} type="button">
            {mode === "edit" ? "Done" : "Edit"}
          </button>
        </div>
      </div>

      <div className="workspace-canvas__scroll">
        {mode === "preview" ? (
          <div className="pdf-preview">
            {previewLoading ? (
              <div className="pdf-preview__state">
                <strong>Generating preview...</strong>
                <p>Rendering the same PDF layout that will be downloaded.</p>
              </div>
            ) : previewError ? (
              <div className="pdf-preview__state pdf-preview__state--error">
                <strong>Preview unavailable</strong>
                <p>{previewError}</p>
              </div>
            ) : previewPdfUrl ? (
              <iframe className="pdf-preview__frame" src={previewPdfUrl} title={`PDF Preview — ${resume.title || "Resume"}`} />
            ) : (
              <div className="pdf-preview__state">
                <strong>Preview is ready when the export finishes</strong>
                <p>Switch back to edit if you want to keep modifying the resume.</p>
              </div>
            )}
          </div>
        ) : (
        <article className="resume-surface">
          <div className="resume-surface__meta">
            <span>{template === "modern" ? "Modern template" : "Classic template"}</span>
            <span>{resume.data.experience.length} experience sections</span>
            <span>{totalBullets} bullets</span>
          </div>
          <header className="resume-surface__header">
            <h1>{profile.fullName}</h1>
            {contactLine ? <p>{contactLine}</p> : null}
            {profile.jobTitle ? <p>{profile.jobTitle}</p> : null}
            {linkLine ? <p>{linkLine}</p> : null}
          </header>

          {resume.data.summary || mode === "edit" ? (
            <section className="resume-surface__section">
              <SectionHeading>Summary</SectionHeading>
              <EditableBlock
                active={Boolean(selectionMeta?.section === "summary")}
                multiline
                value={resume.data.summary}
                onChange={onSummaryChange}
                onSelectText={onSelectText}
                onAction={onFieldAction}
                actionLoadingKey={actionLoadingKey}
                meta={{ section: "summary", field: "summary" }}
                mode={mode}
                className="resume-summary"
                placeholder="Add a concise summary tailored to the type of role you want."
              />
            </section>
          ) : null}

          <section className="resume-surface__section">
            <SectionHeading
              actions={
                mode === "edit" ? (
                  <button className="resume-add-button" onClick={onAddExperience} type="button">
                    + Add experience
                  </button>
                ) : null
              }
            >
              Experience
            </SectionHeading>
            {!resume.data.experience.length ? (
              <div className="resume-empty-state">
                <strong>No experience entries yet</strong>
                <p>Add a role to start building the core of this resume.</p>
              </div>
            ) : null}
            {resume.data.experience.map((entry, expIndex) => (
              <article className="resume-entry" key={`${entry.role}-${entry.company}-${expIndex}`}>
                <div className="resume-entry__header">
                  <div className="resume-entry__title">
                    <EditableBlock
                      active={
                        selectionMeta?.section === "experience" &&
                        selectionMeta?.itemIndex === expIndex &&
                        selectionMeta?.field === "role"
                      }
                      value={entry.role}
                      onChange={(value) => onExperienceRoleChange(expIndex, value)}
                      onSelectText={onSelectText}
                      onAction={onFieldAction}
                      actionLoadingKey={actionLoadingKey}
                      meta={{ section: "experience", itemIndex: expIndex, field: "role" }}
                      mode={mode}
                      className="resume-role"
                      placeholder="Add role title"
                    />
                    <span className="resume-entry__line" />
                  </div>
                  {mode === "edit" ? (
                    <div className="resume-entry__actions">
                      <button className="resume-add-button" onClick={() => onAddExperienceBullet(expIndex)} type="button">
                        + Bullet
                      </button>
                      <button className="resume-bullet__danger" onClick={() => onRemoveExperience(expIndex)} type="button">
                        Delete
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="resume-entry__company-row">
                  <EditableBlock
                    active={
                      selectionMeta?.section === "experience" &&
                      selectionMeta?.itemIndex === expIndex &&
                      selectionMeta?.field === "company"
                    }
                    value={entry.company}
                    onChange={(value) => onExperienceCompanyChange(expIndex, value)}
                    onSelectText={onSelectText}
                    onAction={onFieldAction}
                    actionLoadingKey={actionLoadingKey}
                    meta={{ section: "experience", itemIndex: expIndex, field: "company" }}
                    mode={mode}
                    className="resume-company"
                    placeholder="Add company name"
                  />
                </div>

                <div className="resume-entry__bullets">
                  {entry.points.map((bullet, bulletIndex) => (
                    <BulletRow
                      key={`${expIndex}-${bulletIndex}`}
                      section="experience"
                      itemIndex={expIndex}
                      bulletIndex={bulletIndex}
                      bullet={bullet}
                      selectionMeta={selectionMeta}
                      actionLoadingKey={actionLoadingKey}
                      onSelectText={onSelectText}
                      onChange={(value) => onExperienceBulletChange(expIndex, bulletIndex, value)}
                      onAction={onBulletAction}
                      onRemove={onRemoveExperienceBullet}
                      mode={mode}
                    />
                  ))}
                </div>
              </article>
            ))}
          </section>

          <section className="resume-surface__section">
            <SectionHeading
              actions={
                mode === "edit" ? (
                  <button className="resume-add-button" onClick={onAddProject} type="button">
                    + Add project
                  </button>
                ) : null
              }
            >
              Projects
            </SectionHeading>
            {!resume.data.projects.length ? (
              <div className="resume-empty-state">
                <strong>No project entries yet</strong>
                <p>Add a project to highlight product work, launches, or side builds.</p>
              </div>
            ) : null}
            {resume.data.projects.map((project, projectIndex) => (
              <article className="resume-entry" key={`${project.name}-${projectIndex}`}>
                <div className="resume-entry__header">
                  <div className="resume-entry__title">
                    <EditableBlock
                      active={
                        selectionMeta?.section === "project" &&
                        selectionMeta?.itemIndex === projectIndex &&
                        selectionMeta?.field === "name"
                      }
                      value={project.name}
                      onChange={(value) => onProjectNameChange(projectIndex, value)}
                      onSelectText={onSelectText}
                      onAction={onFieldAction}
                      actionLoadingKey={actionLoadingKey}
                      meta={{ section: "project", itemIndex: projectIndex, field: "name" }}
                      mode={mode}
                      className="resume-role"
                      placeholder="Add project name"
                    />
                    <span className="resume-entry__line" />
                  </div>
                  {mode === "edit" ? (
                    <div className="resume-entry__actions">
                      <button className="resume-add-button" onClick={() => onAddProjectBullet(projectIndex)} type="button">
                        + Bullet
                      </button>
                      <button className="resume-bullet__danger" onClick={() => onRemoveProject(projectIndex)} type="button">
                        Delete
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="resume-entry__bullets">
                  {project.points.map((bullet, bulletIndex) => (
                    <BulletRow
                      key={`${projectIndex}-${bulletIndex}`}
                      section="project"
                      itemIndex={projectIndex}
                      bulletIndex={bulletIndex}
                      bullet={bullet}
                      selectionMeta={selectionMeta}
                      actionLoadingKey={actionLoadingKey}
                      onSelectText={onSelectText}
                      onChange={(value) => onProjectBulletChange(projectIndex, bulletIndex, value)}
                      onAction={onBulletAction}
                      onRemove={onRemoveProjectBullet}
                      mode={mode}
                    />
                  ))}
                </div>
              </article>
            ))}
          </section>

          <section className="resume-surface__section">
            <SectionHeading>Skills</SectionHeading>
            <EditableBlock
              active={Boolean(selectionMeta?.section === "skills")}
              multiline
              value={skillsValue}
              onChange={onSkillsChange}
              onSelectText={onSelectText}
              onAction={onFieldAction}
              actionLoadingKey={actionLoadingKey}
              meta={{ section: "skills", field: "list" }}
              mode={mode}
              className="resume-skills-input"
              placeholder="Add a clean comma-separated skill list."
            />
          </section>
        </article>
        )}
      </div>
    </section>
  );
});

export default Canvas;
