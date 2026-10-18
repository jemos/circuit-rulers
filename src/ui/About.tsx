import { useEffect, useRef } from 'react';

const REPO_URL = 'https://github.com/jemos/circuit-rulers';

export function About({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="about"
      onClose={onClose}
      onClick={(e) => {
        // The dialog itself is only hit on the backdrop; the content fills its box.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="about-body">
        <header className="about-head">
          <h2>
            <svg viewBox="0 0 20 20" width={20} height={20}>
              <path d="M6 3h4M8 3v14M6 17h4M14 3v14M12 9h4" stroke="currentColor" strokeWidth={1.6} fill="none" />
            </svg>
            Circuit Rulers
          </h2>
          <button className="about-close" onClick={onClose} title="Close (Esc)" aria-label="Close">
            ×
          </button>
        </header>
        <p>
          An interactive schematic editor for building intuition about how analog circuits behave over time. Draw a
          circuit, scrub through a transient simulation, and place <strong>voltage rulers</strong> beside the
          schematic.
        </p>
        <p>
          A ruler follows a path of nodes you click, say V<sub>dd</sub> → middle → GND. It shows where each node sits
          and the voltage across each step, on a scale shared by the whole circuit. A <strong>live</strong> ruler
          follows the time scrubber. A <strong>pinned</strong> ruler stays at one moment, so you can put it next to a
          live one and watch the voltages shift.
        </p>
        <p className="dim">
          Everything runs in your browser: a small SPICE-like simulator, the editor and the visualisation. There is no
          backend, and your circuit is saved to this browser's local storage.
        </p>
        <footer className="about-foot">
          <span>
            AI-generated with{' '}
            <a href="https://claude.com/claude-code" target="_blank" rel="noreferrer">
              Claude Code
            </a>{' '}
            from an idea and a hand-drawn sketch, by <span style={{ whiteSpace: 'nowrap' }}>Jean-François</span>{' '}
            Mousinho (
            <a href="https://jemos.net" target="_blank" rel="noreferrer">
              jemos.net
            </a>
            ).
          </span>
          <span>
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              Source on GitHub
            </a>{' '}
            ·{' '}
            <a href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank" rel="noreferrer">
              CC BY-NC 4.0
            </a>
          </span>
        </footer>
      </div>
    </dialog>
  );
}
