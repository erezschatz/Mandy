// DOCX Export Functionality

/**
 * Extract title from editor content (first H1)
 */
function extractDocxTitle() {
  const firstHeading = editor.querySelector("h1");
  if (firstHeading && firstHeading.textContent.trim()) {
    return firstHeading.textContent.trim();
  }
  return "Document";
}

/**
 * Generate filename for DOCX
 */
function generateDocxFilename() {
  const sanitized = slugifyTitle(extractDocxTitle(), "document");
  const timestamp = Date.now();
  return `${sanitized}-${timestamp}.docx`;
}

/**
 * Parse inline text with formatting (bold, italic, code, links)
 */
function parseInlineContent(element) {
  const children = [];

  function processNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      if (text) {
        children.push(new docx.TextRun({ text: text }));
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tagName = node.tagName.toLowerCase();

      if (tagName === "strong" || tagName === "b") {
        const innerText = node.textContent;
        children.push(new docx.TextRun({ text: innerText, bold: true }));
      } else if (tagName === "em" || tagName === "i") {
        const innerText = node.textContent;
        children.push(
          new docx.TextRun({ text: innerText, italics: true })
        );
      } else if (tagName === "code") {
        const innerText = node.textContent;
        children.push(
          new docx.TextRun({
            text: innerText,
            font: "Courier New",
            shading: { fill: "F4F4F4" },
          })
        );
      } else if (tagName === "a") {
        const linkText = node.textContent;
        const href = node.getAttribute("href") || "";
        children.push(
          new docx.ExternalHyperlink({
            children: [
              new docx.TextRun({ text: linkText, style: "Hyperlink" }),
            ],
            link: href,
          })
        );
      } else if (tagName === "img" && node.hasAttribute("data-equation")) {
        children.push(equationRun(node));
      } else if (tagName === "br") {
        children.push(new docx.TextRun({ break: 1 }));
      } else {
        // Recursively process child nodes for nested elements
        node.childNodes.forEach((child) => processNode(child));
      }
    }
  }

  element.childNodes.forEach((child) => processNode(child));
  return children;
}

/**
 * An equation picture from exportEquationImages, as an inline image run lowered
 * by the equation's depth so it sits on the line's baseline the way it does in
 * the editor. Word lowers a run by `w:position`, in half-points; docx 7.1.0 has
 * no option for it, so the element goes into the run's properties directly.
 * That reaches into the library's internals, which the pinned version keeps
 * still: re-check it on any upgrade of DOCX_SRC.
 */
function equationRun(img) {
  const base64 = img.getAttribute("src").split(",")[1];
  const run = new docx.ImageRun({
    data: Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
    transformation: {
      width: parseFloat(img.getAttribute("data-width")),
      height: parseFloat(img.getAttribute("data-height")),
    },
  });
  // A CSS pixel is 0.75pt, so 1.5 half-points.
  const lower = Math.round(parseFloat(img.getAttribute("data-depth")) * 1.5);
  if (lower > 0 && run.properties && Array.isArray(run.properties.root)) {
    run.properties.root.push(new docx.ImportedXmlComponent("w:position", { "w:val": -lower }));
  }
  return run;
}

/**
 * A paragraph holding nothing but one display equation is centred, as the
 * editor draws it.
 */
function isDisplayEquationOnly(element) {
  const equations = element.querySelectorAll('img[data-equation="block"]');
  return equations.length === 1 && !element.textContent.trim();
}

/**
 * Convert HTML element to DOCX paragraph(s)
 */
function htmlElementToDocx(element) {
  const tagName = element.tagName ? element.tagName.toLowerCase() : "";
  const paragraphs = [];

  switch (tagName) {
    case "h1":
      paragraphs.push(
        new docx.Paragraph({
          children: parseInlineContent(element),
          heading: docx.HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 },
        })
      );
      break;

    case "h2":
      paragraphs.push(
        new docx.Paragraph({
          children: parseInlineContent(element),
          heading: docx.HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 150 },
        })
      );
      break;

    case "h3":
      paragraphs.push(
        new docx.Paragraph({
          children: parseInlineContent(element),
          heading: docx.HeadingLevel.HEADING_3,
          spacing: { before: 250, after: 120 },
        })
      );
      break;

    case "h4":
    case "h5":
    case "h6":
      paragraphs.push(
        new docx.Paragraph({
          children: parseInlineContent(element),
          heading: docx.HeadingLevel.HEADING_4,
          spacing: { before: 200, after: 100 },
        })
      );
      break;

    case "p":
      paragraphs.push(
        new docx.Paragraph({
          children: parseInlineContent(element),
          spacing: { after: 200 },
          ...(isDisplayEquationOnly(element) ? { alignment: docx.AlignmentType.CENTER } : {}),
        })
      );
      break;

    case "ul":
      element.querySelectorAll(":scope > li").forEach((li) => {
        paragraphs.push(
          new docx.Paragraph({
            children: parseInlineContent(li),
            bullet: { level: 0 },
            spacing: { after: 100 },
          })
        );
      });
      break;

    case "ol":
      element.querySelectorAll(":scope > li").forEach((li, index) => {
        paragraphs.push(
          new docx.Paragraph({
            children: parseInlineContent(li),
            numbering: { reference: "default-numbering", level: 0 },
            spacing: { after: 100 },
          })
        );
      });
      break;

    case "blockquote":
      paragraphs.push(
        new docx.Paragraph({
          children: parseInlineContent(element),
          indent: { left: 720 },
          border: {
            left: {
              style: docx.BorderStyle.SINGLE,
              size: 24,
              color: "3498DB",
            },
          },
          spacing: { after: 200 },
        })
      );
      break;

    case "pre":
      const codeContent = element.textContent || "";
      const codeLines = codeContent.split("\n");
      codeLines.forEach((line, index) => {
        paragraphs.push(
          new docx.Paragraph({
            children: [
              new docx.TextRun({
                text: line || " ",
                font: "Courier New",
                size: 20,
              }),
            ],
            shading: { fill: "F4F4F4" },
            spacing: { after: index === codeLines.length - 1 ? 200 : 0 },
          })
        );
      });
      break;

    case "hr":
      paragraphs.push(
        new docx.Paragraph({
          children: [],
          border: {
            bottom: {
              style: docx.BorderStyle.SINGLE,
              size: 6,
              color: "CCCCCC",
            },
          },
          spacing: { before: 400, after: 400 },
        })
      );
      break;

    case "table":
      const tableRows = [];
      element.querySelectorAll("tr").forEach((tr) => {
        const cells = [];
        tr.querySelectorAll("th, td").forEach((cell) => {
          const isHeader = cell.tagName.toLowerCase() === "th";
          cells.push(
            new docx.TableCell({
              children: [
                new docx.Paragraph({
                  children: parseInlineContent(cell),
                  ...(isHeader ? { bold: true } : {}),
                }),
              ],
              shading: isHeader ? { fill: "F5F5F5" } : {},
              margins: { top: 100, bottom: 100, left: 100, right: 100 },
            })
          );
        });
        if (cells.length > 0) {
          tableRows.push(new docx.TableRow({ children: cells }));
        }
      });
      if (tableRows.length > 0) {
        paragraphs.push(
          new docx.Table({
            rows: tableRows,
            width: { size: 100, type: docx.WidthType.PERCENTAGE },
          })
        );
        // Add spacing after table
        paragraphs.push(
          new docx.Paragraph({ children: [], spacing: { after: 200 } })
        );
      }
      break;

    case "div":
      break;

    default:
      // For unknown elements, try to get text content
      if (element.textContent && element.textContent.trim()) {
        paragraphs.push(
          new docx.Paragraph({
            children: [new docx.TextRun({ text: element.textContent })],
            spacing: { after: 200 },
          })
        );
      }
  }

  return paragraphs;
}

/**
 * Convert a document root's content to DOCX elements. The root is the clone
 * modelExportClone hands over rather than the editor itself, so a caret stop
 * does not become a zero-width run nor its filler <br> a line break in Word.
 */
function convertHtmlToDocxElements(root) {
  const docxElements = [];
  const editorChildren = root.children;

  for (let i = 0; i < editorChildren.length; i++) {
    const child = editorChildren[i];
    const elements = htmlElementToDocx(child);
    docxElements.push(...elements);
  }

  // If no content, add empty paragraph
  if (docxElements.length === 0) {
    docxElements.push(new docx.Paragraph({ children: [] }));
  }

  return docxElements;
}

/**
 * Generate and download DOCX file
 */
async function generateDOCX() {
  try {
    await ensureDocx();
  } catch (error) {
    throw new Error(
      "Could not load the DOCX library. Check your connection."
    );
  }

  const title = extractDocxTitle();
  // Equations as pictures, or as their TeX when there is no way to draw one:
  // the container's own text is MathJax's assistive copy, bare letters.
  const root = modelExportClone(editor);
  await exportEquationImages(root, { fallback: "source" });
  const docxElements = convertHtmlToDocxElements(root);

  const doc = new docx.Document({
    title: title,
    creator: "Mandy Markdown Editor",
    description: "Document created with Mandy",
    numbering: {
      config: [
        {
          reference: "default-numbering",
          levels: [
            {
              level: 0,
              format: docx.LevelFormat.DECIMAL,
              text: "%1.",
              alignment: docx.AlignmentType.START,
              style: {
                paragraph: {
                  indent: { left: 720, hanging: 360 },
                },
              },
            },
          ],
        },
      ],
    },
    styles: {
      paragraphStyles: [
        {
          id: "Normal",
          name: "Normal",
          basedOn: "Normal",
          next: "Normal",
          run: {
            font: "Arial",
            size: 24, // 12pt
          },
          paragraph: {
            spacing: { line: 276 }, // 1.15 line spacing
          },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch
              right: 1440,
              bottom: 1440,
              left: 1440,
              header: 720, // 0.5 inch
              footer: 720,
              gutter: 0,
            },
          },
        },
        children: docxElements,
      },
    ],
  });

  const filename = generateDocxFilename();

  const blob = await docx.Packer.toBlob(doc);
  saveAs(blob, filename);

  return { success: true, filename: filename };
}

  // Progress reported through notify for the same reason PDF's is: the button
  // is a menu item, and the menu is closed before the work starts.
  onToolbarAction("export-docx", async (docxBtn) => {
    if (docxBtn) docxBtn.disabled = true;
    const done = notify("Generating Word document…", { severity: "info", timeout: 0 });

    try {
      await generateDOCX();
      done();
      notify("Word document saved.", { severity: "success" });
    } catch (error) {
      console.error("[DOCX] Error:", error);
      done();
      notify(`Failed to generate DOCX: ${error.message}`, { severity: "error" });
    } finally {
      if (docxBtn) docxBtn.disabled = false;
    }
  });
