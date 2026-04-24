import type { WebContainer, WebContainerProcess } from '@webcontainer/api';
import { atom, type WritableAtom } from 'nanostores';
import { isHostedRuntimeEnabled } from '~/lib/runtime/hosted-runtime-client';
import type { ITerminal } from '~/types/terminal';
import { newBoltShellProcess, newShellProcess } from '~/utils/shell';
import { coloredText } from '~/utils/terminal';

const hotData = import.meta.hot?.data ?? {};
const MAX_BUFFERED_BOLT_TERMINAL_OUTPUT_CHARS = 80_000;

type DeferredBoltTerminal = ITerminal & {
  attachDelegate: (terminal: ITerminal) => void;
};

function capBufferedTerminalOutput(value: string) {
  if (value.length <= MAX_BUFFERED_BOLT_TERMINAL_OUTPUT_CHARS) {
    return value;
  }

  return value.slice(-MAX_BUFFERED_BOLT_TERMINAL_OUTPUT_CHARS);
}

export function createDeferredBoltTerminal(): DeferredBoltTerminal {
  let delegate: ITerminal | undefined;
  let bufferedOutput = '';
  const dataListeners = new Set<(data: string) => void>();

  const attachDelegate = (terminal: ITerminal) => {
    delegate = terminal;
    delegate.reset();

    for (const listener of dataListeners) {
      delegate.onData(listener);
    }

    if (bufferedOutput) {
      delegate.write(bufferedOutput);
    }
  };

  return {
    get cols() {
      return delegate?.cols;
    },
    get rows() {
      return delegate?.rows;
    },
    reset() {
      bufferedOutput = '';
      delegate?.reset();
    },
    write(data: string) {
      bufferedOutput = capBufferedTerminalOutput(`${bufferedOutput}${data}`);
      delegate?.write(data);
    },
    onData(cb: (data: string) => void) {
      dataListeners.add(cb);
      delegate?.onData(cb);
    },
    input(data: string) {
      delegate?.input(data);

      for (const listener of dataListeners) {
        listener(data);
      }
    },
    attachDelegate,
  };
}

export class TerminalStore {
  #webcontainer: Promise<WebContainer>;
  #terminals: Array<{ terminal: ITerminal; process: WebContainerProcess }> = [];
  #boltTerminal = newBoltShellProcess();
  #boltTerminalBridge = createDeferredBoltTerminal();
  #boltTerminalInitPromise: Promise<void> | undefined;
  #runtimeTerminal = newBoltShellProcess();
  #runtimeTerminalBridge = createDeferredBoltTerminal();
  #runtimeTerminalInitPromise: Promise<void> | undefined;

  showTerminal: WritableAtom<boolean> = hotData?.showTerminal ?? atom(true);

  constructor(webcontainerPromise: Promise<WebContainer>) {
    this.#webcontainer = webcontainerPromise;

    if (!isHostedRuntimeEnabled()) {
      void this.#ensureBoltTerminalReady().catch((error) => {
        console.warn('Failed to initialize background bolt shell:', error);
      });
    }

    if (import.meta.hot) {
      const hot = import.meta.hot as any;
      hot.data ??= {};
      hot.data.showTerminal = this.showTerminal;
    }
  }
  get boltTerminal() {
    return this.#boltTerminal;
  }

  get runtimeTerminal() {
    void this.#ensureRuntimeTerminalReady();
    return this.#runtimeTerminal;
  }

  async #ensureBoltTerminalReady() {
    if (isHostedRuntimeEnabled()) {
      return;
    }

    if (!this.#boltTerminalInitPromise) {
      this.#boltTerminalInitPromise = (async () => {
        const wc = await this.#webcontainer;
        await this.#boltTerminal.init(wc, this.#boltTerminalBridge);
      })().catch((error) => {
        this.#boltTerminalInitPromise = undefined;
        throw error;
      });
    }

    await this.#boltTerminalInitPromise;
  }

  async #ensureRuntimeTerminalReady() {
    if (isHostedRuntimeEnabled()) {
      return;
    }

    if (!this.#runtimeTerminalInitPromise) {
      this.#runtimeTerminalInitPromise = (async () => {
        const wc = await this.#webcontainer;
        await this.#runtimeTerminal.init(wc, this.#runtimeTerminalBridge);
      })().catch((error) => {
        this.#runtimeTerminalInitPromise = undefined;
        throw error;
      });
    }

    await this.#runtimeTerminalInitPromise;
  }

  toggleTerminal(value?: boolean) {
    this.showTerminal.set(value !== undefined ? value : !this.showTerminal.get());
  }
  async attachBoltTerminal(terminal: ITerminal) {
    if (isHostedRuntimeEnabled()) {
      terminal.reset();
      terminal.write(
        `Hosted runtime active\r\nInteractive browser shells are disabled on managed instances.\r\nBolt runs install, build, and preview commands on the server and streams the result back into the workspace.\r\n`,
      );

      return;
    }

    try {
      this.#boltTerminalBridge.attachDelegate(terminal);
      await this.#ensureBoltTerminalReady();
    } catch (error: any) {
      terminal.write(coloredText.red('Failed to spawn bolt shell\n\n') + error.message);
      return;
    }
  }

  async attachTerminal(terminal: ITerminal) {
    if (isHostedRuntimeEnabled()) {
      terminal.reset();
      terminal.write(
        `Hosted runtime active\r\nUse chat tasks to run commands on the server. Ad-hoc interactive browser terminals stay disabled on hosted instances to keep the browser lightweight.\r\n`,
      );

      return;
    }

    try {
      const shellProcess = await newShellProcess(await this.#webcontainer, terminal);
      this.#terminals.push({ terminal, process: shellProcess });
    } catch (error: any) {
      terminal.write(coloredText.red('Failed to spawn shell\n\n') + error.message);
      return;
    }
  }

  onTerminalResize(cols: number, rows: number) {
    for (const { process } of this.#terminals) {
      process.resize({ cols, rows });
    }
  }

  async detachTerminal(terminal: ITerminal) {
    const terminalIndex = this.#terminals.findIndex((t) => t.terminal === terminal);

    if (terminalIndex !== -1) {
      const { process } = this.#terminals[terminalIndex];

      try {
        process.kill();
      } catch (error) {
        console.warn('Failed to kill terminal process:', error);
      }
      this.#terminals.splice(terminalIndex, 1);
    }
  }
}
