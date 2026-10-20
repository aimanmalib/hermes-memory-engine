# hermes-memory-engine demo. Regenerate: `vhs docs/demo/demo.tape` (needs `npm i -g hermes-memory-engine` and VHS).
# Every line of output is real CLI output; nothing is faked or sped up.
Output docs/demo/demo.gif

Set Shell "bash"
Set FontSize 18
Set Width 1200
Set Height 640
Set Padding 28
Set Theme { "name": "sasateguh", "black": "#0a0c11", "red": "#ff6a5c", "green": "#7ee0a1", "yellow": "#ffc35a", "blue": "#7aa7ff", "magenta": "#d2a8ff", "cyan": "#4fd1e8", "white": "#c9d1dc", "brightBlack": "#6f7a8e", "brightRed": "#ff8a7a", "brightGreen": "#a6f0c0", "brightYellow": "#ffd68a", "brightBlue": "#a3c2ff", "brightMagenta": "#e2c6ff", "brightCyan": "#8fe6f4", "brightWhite": "#f4f6fa", "background": "#0a0c11", "foreground": "#e6e9ef", "selection": "#232a38", "cursor": "#ff6a2e" }
Set TypingSpeed 35ms

Hide
Type "export PS1='\[\e[38;5;209m\]❯\[\e[0m\] ' && rm -rf ~/my-agent && mkdir -p ~/my-agent && cd ~/my-agent && clear"
Enter
Sleep 500ms
Show

Type "# Give your agents a memory that lives in plain Markdown files"
Enter
Sleep 600ms
Type "hermes-memory init"
Enter
Sleep 1.2s

Type `hermes-memory add "User prefers TypeScript and short answers" --tags preferences --agent assistant`
Enter
Sleep 1.2s
Type `hermes-memory add "Deploys go through staging first" --tags ops --agent assistant`
Enter
Sleep 1.2s
Type `hermes-memory add "Client demo is on Thursday" --tags project --agent planner`
Enter
Sleep 1.5s

Type "clear"
Enter
Type `hermes-memory search "typescript"`
Enter
Sleep 2s

Type "clear"
Enter
Type "# One readable .md file per memory, grouped by agent: diff, grep and commit them"
Enter
Sleep 500ms
Type "find .hermes-memory -name '*.md'"
Enter
Sleep 1.5s
Type "cat .hermes-memory/planner/*.md"
Enter
Sleep 4.5s
