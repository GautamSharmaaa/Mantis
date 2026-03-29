import React, { memo } from "react";

const templates = [
  {
    id: "classic",
    name: "Classic",
    description: "Clean, minimal, ATS-friendly",
  },
  {
    id: "modern",
    name: "Modern",
    description: "Spacious with visual hierarchy",
  },
];

const ACCENT_COLORS = [
  { value: "#16a34a", label: "Mantis Green" },
  { value: "#2563eb", label: "Royal Blue" },
  { value: "#7c3aed", label: "Deep Purple" },
  { value: "#dc2626", label: "Crimson" },
  { value: "#475569", label: "Slate" },
  { value: "#d97706", label: "Amber" },
];

const TemplateSelector = memo(function TemplateSelector({
  value = "classic",
  accentColor = "#16a34a",
  onChange = () => {},
  onColorChange = () => {},
}) {
  return (
    <section className="template-strip">
      <div className="template-strip__templates">
        {templates.map((template) => (
          <button
            key={template.id}
            className={`template-card ${value === template.id ? "template-card--active" : ""}`}
            onClick={() => onChange(template.id)}
            type="button"
          >
            <div className="template-card__preview">
              <span />
              <span />
              <span />
            </div>
            <div className="template-card__content">
              <strong>{template.name}</strong>
              <span>{template.description}</span>
            </div>
            {value === template.id ? <span className="template-card__check">✓</span> : null}
          </button>
        ))}
      </div>
      <div className="template-strip__colors">
        <span className="template-strip__color-label">Accent Color</span>
        <div className="template-strip__color-swatches">
          {ACCENT_COLORS.map((color) => (
            <button
              key={color.value}
              className={`template-color-swatch ${accentColor === color.value ? "template-color-swatch--active" : ""}`}
              style={{ background: color.value }}
              onClick={() => onColorChange(color.value)}
              title={color.label}
              type="button"
              aria-label={color.label}
            />
          ))}
        </div>
      </div>
    </section>
  );
});

export default TemplateSelector;
