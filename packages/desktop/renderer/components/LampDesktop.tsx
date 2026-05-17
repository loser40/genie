import React from 'react';

export type LampState = 'idle' | 'hover' | 'vibrating' | 'summoning' | 'open';
const lampSrc = new URL('../../assets/lamp.png', import.meta.url).href;
const genieSrc = new URL('../../assets/genie-companion.webp', import.meta.url).href;

interface Props {
  state: LampState;
  summonKey: number;
  onClick: () => void;
  onGenieClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export function LampDesktop({ state, summonKey, onClick, onGenieClick, onMouseEnter, onMouseLeave }: Props): JSX.Element {
  const companionVisible = state === 'summoning' || state === 'open';

  const animClass = state === 'vibrating'
    ? 'lamp-vibrate'
    : state === 'hover'
      ? 'lamp-hover'
      : state === 'summoning' || state === 'open'
        ? 'lamp-open'
        : 'lamp-idle';

  function handleMouseEnter(): void {
    window.genie.setInteractive(true);
    onMouseEnter();
  }

  function handleMouseLeave(): void {
    window.genie.setInteractive(false);
    onMouseLeave();
  }

  function handleLampClick(): void {
    onClick();
  }

  function handleGenieClick(event: React.MouseEvent): void {
    event.stopPropagation();
    onGenieClick();
  }

  function handleQuit(event: React.MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    window.genie.quitApp();
  }

  return (
    <div className="lamp-container">
      <div className={`magic-circle ${state === 'hover' || state === 'open' || state === 'summoning' ? 'circle-active' : ''}`} />
      <div className={`smoke-wrap ${state === 'summoning' ? 'smoke-summon' : ''}`}>
        <div className="smoke smoke-1" />
        <div className="smoke smoke-2" />
        <div className="smoke smoke-3" />
      </div>
      <div className={`spout-particles ${state === 'vibrating' || state === 'summoning' ? 'particles-active' : ''}`}>
        <span />
        <span />
        <span />
        <span />
      </div>
      <div
        className={`genie-companion ${companionVisible ? 'genie-visible' : ''}`}
        onClick={handleGenieClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {companionVisible ? (
          <img
            key={summonKey}
            src={genieSrc}
            alt="GENIE companion"
            className="genie-img genie-avatar"
            draggable={false}
          />
        ) : null}
      </div>
      <div
        className={`lamp-image-wrap ${animClass}`}
        onClick={handleLampClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <button
          className="lamp-exit-btn"
          type="button"
          aria-label="Close GENIE"
          onClick={handleQuit}
        >
          x
        </button>
        <img src={lampSrc} alt="GENIE Lamp" className="lamp-img" draggable={false} />
        <div className={`lamp-glow ${state !== 'idle' ? 'glow-bright' : ''}`} />
      </div>
      <div className="sparkle s1" />
      <div className="sparkle s2" />
      <div className="sparkle s3" />
    </div>
  );
}
