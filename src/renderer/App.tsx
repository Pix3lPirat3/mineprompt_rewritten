import { useEffect, useState } from 'react';
import { startBridge } from './bridge';
import { FeatureErrorBoundary } from './components/FeatureErrorBoundary';
import { useAppDispatch } from './store';
import { InventoryWorkspace } from './features/inventory/InventoryWorkspace';
import { PlayerRibbon } from './features/players/PlayerRibbon';
import { TargetRibbon } from './features/targets/TargetRibbon';
import { Dialogs } from './features/shell/Dialogs';
import { Sidebar, type DialogTarget } from './features/shell/Sidebar';
import { TerminalDock } from './features/terminal/TerminalDock';
import { GameOverlay } from './features/hud/GameOverlay';

export function App() {
  const dispatch = useAppDispatch();
  const [dialog, setDialog] = useState<DialogTarget | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void startBridge(dispatch, controller.signal);
    return () => controller.abort();
  }, [dispatch]);

  return (
    <main className="app-shell">
      <Sidebar open={setDialog} />
      <section className="workspace">
        <GameOverlay />
        <PlayerRibbon />
        <TargetRibbon />
        <div className="workspace-content">
          <FeatureErrorBoundary label="Inventory workspace">
            <InventoryWorkspace />
          </FeatureErrorBoundary>
        </div>
        <TerminalDock />
      </section>
      {dialog ? <Dialogs target={dialog} close={() => setDialog(null)} /> : null}
    </main>
  );
}
