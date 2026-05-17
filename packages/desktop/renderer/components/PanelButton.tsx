interface Props {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export function PanelButton({ icon, label, onClick, disabled = false }: Props): JSX.Element {
  return (
    <button
      className="grid-btn"
      type="button"
      onClick={onClick}
      onMouseEnter={() => window.genie.setInteractive(true)}
      disabled={disabled}
    >
      <span className="grid-btn-icon">{icon}</span>
      <span className="grid-btn-label">{label}</span>
    </button>
  );
}
