import React, { useState } from 'react';

interface Props {
  onDrop: (path: string) => void;
}

export function DropZone({ onDrop }: Props): JSX.Element {
  const [dragOver, setDragOver] = useState(false);

  function handleDrop(event: React.DragEvent): void {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files[0];
    if (!file) return;
    const filePath = window.genie.getFilePath(file);
    onDrop(filePath || file.name);
  }

  return (
    <div
      className={`drop-zone ${dragOver ? 'drop-zone-active' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {dragOver ? 'Drop it' : 'Drop project folder or ZIP here'}
    </div>
  );
}
