export interface Command {
  id: string;
  title: string;
  category?: string;
  run: () => void | Promise<void>;
  isEnabled?: () => boolean;
}

class CommandRegistry {
  private commands = new Map<string, Command>();

  register(cmd: Command): void {
    this.commands.set(cmd.id, cmd);
  }

  get(id: string): Command | undefined {
    return this.commands.get(id);
  }

  all(): Command[] {
    return [...this.commands.values()];
  }

  async run(id: string): Promise<void> {
    const cmd = this.commands.get(id);
    if (!cmd) return;
    if (cmd.isEnabled && !cmd.isEnabled()) return;
    await cmd.run();
  }
}

export const commandRegistry = new CommandRegistry();
