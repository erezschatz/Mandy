const defaultContent = `<h1>👋 Welcome to Marky</h1>
<p>A simple markdown editor that runs in your browser. Start typing and see your formatted text in real-time!</p>
<h2>✨ Quick Start</h2>
<ul>
<li><strong>Select text</strong> to see formatting options appear above</li>
<li><strong>Paste MD</strong> - Load markdown from your clipboard</li>
<li><strong>Open</strong> - Open a markdown file from your computer</li>
<li><strong>Save</strong> - Write your work straight back to that file (or press <strong>Ctrl+S</strong>)</li>
<li><strong>Copy MD</strong> - Copy to clipboard instantly</li>
<li><strong>Export HTML</strong> - Generate editable HTML files that anyone can modify and return to you!</li>
</ul>
<h2>⌨️ Keyboard Shortcuts</h2>
<ul>
<li><strong>Ctrl+S</strong> (Cmd+S on Mac) - Save</li>
<li><strong>Ctrl+Shift+S</strong> (Cmd+Shift+S on Mac) - Save as</li>
<li><strong>Ctrl+O</strong> (Cmd+O on Mac) - Open file</li>
<li><strong>Ctrl+Z</strong> (Cmd+Z on Mac) - Undo</li>
<li><strong>Ctrl+Y</strong> or <strong>Ctrl+Shift+Z</strong> (Cmd+Shift+Z on Mac) - Redo</li>
</ul>
<h2>Latex and Mermaid Support - including docx export!</h2>
<p>Marky supports rendering LaTeX math and Mermaid diagrams. You can include LaTeX using <code>$$...$$</code> for block math or <code>$...$</code> for inline math. Mermaid diagrams can be included using fenced code blocks with <code>mermaid</code> as the language.</p>
<p>When exporting to docx, Mermaid diagrams are converted into images so they survive the trip. LaTeX is exported as plain text — the characters come through, but the maths is not rendered.</p>
<p>Sample Mermaid diagram:</p>
<pre><code class="language-mermaid">graph TD;
    A-->B;
    A-->C;
    B-->D;
    C-->D;</code></pre>
<p>Sample LaTeX math:</p>
$$\mathbb{N} = \{ a \in \mathbb{Z} : a > 0 \}$$
`;
