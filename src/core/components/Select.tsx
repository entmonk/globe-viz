import "../styles/Select.css";

interface SelectOption {
  label: string;
  value: string | number;
}

interface SelectProps {
  label?: string;
  value: string | number;
  options: SelectOption[];
  onChange?: (value: string | number) => void;
  disabled?: boolean;
  className?: string;
}

export function Select({
  label,
  value,
  options,
  onChange,
  disabled = false,
  className = "",
}: SelectProps) {
  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = event.target.value;
    onChange?.(newValue);
  };

  return (
    <div
      className={`select-container ${className} ${disabled ? "disabled" : ""}`}
    >
      {label && (
        <label className="select-label" htmlFor={`select-${label}`}>
          {label}
        </label>
      )}

      <select
        id={label ? `select-${label}` : undefined}
        value={value}
        onChange={handleChange}
        disabled={disabled}
        className="select-input"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
