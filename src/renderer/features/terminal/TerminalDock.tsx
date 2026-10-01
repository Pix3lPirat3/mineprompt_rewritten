import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { shallowEqual } from 'react-redux';
import { consoleActions, uiActions, useAppDispatch, useAppSelector } from '../../store';

export function replaceToken(input: string, completion: string): string {
  const token = /\s|["\\]/u.test(completion) ? `"${completion.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"` : completion;
  const trailing = /\s$/u.test(input);
  if (trailing) return `${input}${token} `;
  const boundary = Math.max(input.lastIndexOf(' '), input.lastIndexOf('\t'));
  return `${input.slice(0, boundary + 1)}${token} `;
}

export function TerminalDock() {
  const dispatch = useAppDispatch();
  const open = useAppSelector((state) => state.ui.terminalOpen);
  const height = useAppSelector((state) => state.ui.terminalHeight);
  const entries = useAppSelector((state) => state.console.entries);
  const prepared = useAppSelector((state) => state.console.preparedCommand);
  const sessionId = useAppSelector((state) => state.runtime.selectedSessionId);
  const sessionNames = useAppSelector((state) => Object.fromEntries(state.runtime.sessions.map((session) => [
    session.id,
    session.state.displayName || session.id.slice(0, 8)
  ])), shallowEqual);
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const history = useRef<string[]>([]);
  const historyIndex = useRef(0);
  const output = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!prepared) return;
    setInput(prepared);
    setSuggestions([]);
    dispatch(consoleActions.commandConsumed());
    dispatch(uiActions.terminalOpened());
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [dispatch, prepared]);

  useEffect(() => {
    output.current?.scrollTo({ top: output.current.scrollHeight });
  }, [entries]);

  useEffect(() => {
    if (!input.trim()) {
      setSuggestions([]);
      return;
    }
    let current = true;
    const timer = window.setTimeout(() => {
      void window.mineprompt.complete(input, sessionId).then((values) => {
        if (current) setSuggestions(values.slice(0, 12));
      });
    }, 90);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [input, sessionId]);

  const submit = async () => {
    const command = input.trim();
    if (!command) return;
    history.current = [...history.current.filter((entry) => entry !== command), command].slice(-200);
    historyIndex.current = history.current.length;
    dispatch(consoleActions.entryReceived({ level: 'log', message: `> ${command}`, timestamp: Date.now(), sessionId }));
    setInput('');
    setSuggestions([]);
    await window.mineprompt.execute(command, sessionId);
  };

  const keyboard = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void submit();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      if (suggestions[0]) setInput(replaceToken(input, suggestions[0]));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      historyIndex.current = Math.max(0, historyIndex.current - 1);
      setInput(history.current[historyIndex.current] || '');
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      historyIndex.current = Math.min(history.current.length, historyIndex.current + 1);
      setInput(history.current[historyIndex.current] || '');
      return;
    }
    if (event.key === 'Escape') setSuggestions([]);
  };

  const resize = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const startY = event.clientY;
    const startHeight = height;
    const move = (next: globalThis.PointerEvent) => dispatch(uiActions.terminalHeightChanged(startHeight + startY - next.clientY));
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };

  const visibleEntries = useMemo(() => entries.slice(-500), [entries]);

  return (
    <section className="terminal-dock" data-open={open} style={{ '--terminal-height': `${height}px` } as React.CSSProperties}>
      {open ? <div className="terminal-resize" onPointerDown={resize} /> : null}
      <header>
        <div>
          <strong>Command console</strong>
          <small>Tab completes commands, players, items, and arguments</small>
        </div>
        <div>
          {open ? <button type="button" onClick={() => dispatch(consoleActions.cleared())}>Clear</button> : null}
          <button type="button" onClick={() => dispatch(uiActions.terminalToggled())}>{open ? 'Hide' : 'Show terminal'}</button>
        </div>
      </header>
      {open ? (
        <div className="terminal-dock__body">
          <div ref={output} className="terminal-output" role="log" aria-live="polite">
            {visibleEntries.map((entry, index) => (
              <div className="terminal-line" data-level={entry.level} key={`${entry.timestamp}:${index}`}>
                <time>{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
                <em>{entry.sessionId ? sessionNames[entry.sessionId] || entry.sessionId.slice(0, 8) : 'App'}</em>
                <span>{entry.message}</span>
              </div>
            ))}
          </div>
          <div className="terminal-input-row">
            <span>&gt;</span>
            <input
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={keyboard}
              autoComplete="off"
              spellCheck={false}
              aria-label="Command"
              placeholder="Type a command"
            />
            <button type="button" onClick={() => void submit()}>Run</button>
            {suggestions.length ? (
              <div className="terminal-suggestions">
                {suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => setInput(replaceToken(input, suggestion))}>{suggestion}</button>)}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
