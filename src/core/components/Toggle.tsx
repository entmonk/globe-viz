import "../styles/Toggle.css";

interface ToggleProps {
  label: string;
  value: boolean;
  onChange?: (value: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function Toggle({
  label,
  value,
  onChange,
  disabled = false,
  className = "",
}: ToggleProps) {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.(event.target.checked);
  };

  return (
    <div
      className={`toggle-container ${className} ${disabled ? "disabled" : ""}`}
    >
      {label && /\s/.test(label) && (
        <span className="toggle-label">{label}</span>
      )}

      <label className="toggle-switch" htmlFor={`toggle-${label}`}>
        <input
          id={`toggle-${label}`}
          type="checkbox"
          checked={value}
          onChange={handleChange}
          disabled={disabled}
          className="toggle-input"
        />
        <span className="toggle-slider"></span>
      </label>
    </div>
  );
}
