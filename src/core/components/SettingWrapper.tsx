import { useState } from "react";
import "../styles/SettingWrapper.css";

interface SettingWrapperProps {
  label: string;
  description?: string;
  children: React.ReactNode;
  rightContent?: React.ReactNode;
  layout?: "inline" | "stacked";
}

export function SettingWrapper({
  label,
  description,
  children,
  rightContent,
  layout = "stacked",
}: SettingWrapperProps) {
  const [isHelpExpanded, setIsHelpExpanded] = useState(false);

  const hasExpandableContent = !!description;

  const toggleHelp = () => {
    if (hasExpandableContent) {
      setIsHelpExpanded(!isHelpExpanded);
    }
  };

  return (
    <div className={`setting-wrapper ${layout}`}>
      <div className="setting-header">
        <button
          className={`setting-label-button ${
            hasExpandableContent ? "has-help" : ""
          }`}
          onClick={toggleHelp}
          disabled={!hasExpandableContent}
        >
          <span className="setting-label-text">{label}</span>
          {hasExpandableContent && (
            <span
              className={`setting-caret ${isHelpExpanded ? "expanded" : ""}`}
            >
              ▼
            </span>
          )}
        </button>
        {layout === "inline" ? (
          <div className="setting-inline-control">{children}</div>
        ) : (
          rightContent && (
            <div className="setting-right-content">{rightContent}</div>
          )
        )}
      </div>

      {hasExpandableContent && isHelpExpanded && (
        <div className="setting-help">
          {description && <p className="setting-description">{description}</p>}
        </div>
      )}

      {layout === "stacked" && (
        <div className="setting-control">{children}</div>
      )}
    </div>
  );
}
