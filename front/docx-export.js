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
 * Convert SVG element to PNG data URL
 */
async function svgToPngDataUrl(svgElement, maxWidth = 1200) {
  return new Promise((resolve, reject) => {
    try {
      // Clone the SVG to avoid modifying the original
      const svgClone = svgElement.cloneNode(true);

      // Get dimensions - prefer getBoundingClientRect() for actual rendered size,
      // since SVG attributes may be percentages or small viewBox units
      const bbox = svgElement.getBoundingClientRect();
      const attrWidth = parseFloat(svgClone.getAttribute("width"));
      const attrHeight = parseFloat(svgClone.getAttribute("height"));
      const rawAttr = svgClone.getAttribute("width") || "";
      // Reject attribute values that are percentages or suspiciously small
      const attrIsReliable = attrWidth > 10 && !rawAttr.includes("%");

      let width = (bbox.width > 10 ? bbox.width : null)
        || (attrIsReliable ? attrWidth : null)
        || 400;
      let height = (bbox.height > 10 ? bbox.height : null)
        || (attrIsReliable ? attrHeight : null)
        || 300;

      // Scale down if too wide
      if (width > maxWidth) {
        const scale = maxWidth / width;
        height = height * scale;
        width = maxWidth;
      }

      // Round dimensions
      width = Math.round(width);
      height = Math.round(height);

      // Ensure SVG has proper attributes
      svgClone.setAttribute("width", width);
      svgClone.setAttribute("height", height);
      svgClone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      svgClone.setAttribute(
        "xmlns:xlink",
        "http://www.w3.org/1999/xlink"
      );

      // Remove any external references that could taint the canvas
      svgClone.querySelectorAll("use").forEach((use) => {
        const href =
          use.getAttribute("href") || use.getAttribute("xlink:href");
        if (href && href.startsWith("http")) {
          use.remove();
        }
      });

      // Inline all computed styles to avoid external CSS issues
      const allElements = svgClone.querySelectorAll("*");
      allElements.forEach((el) => {
        const computed = window.getComputedStyle(
          svgElement.querySelector(el.tagName) || el
        );
        // Only inline essential styles
        if (computed.fill && computed.fill !== "none") {
          el.style.fill = computed.fill;
        }
        if (computed.stroke && computed.stroke !== "none") {
          el.style.stroke = computed.stroke;
        }
        if (computed.fontFamily) {
          el.style.fontFamily = "Arial, sans-serif"; // Use safe font
        }
      });

      // Add white background
      const bgRect = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "rect"
      );
      bgRect.setAttribute("width", "100%");
      bgRect.setAttribute("height", "100%");
      bgRect.setAttribute("fill", "white");
      svgClone.insertBefore(bgRect, svgClone.firstChild);

      // Convert to data URL directly (not blob URL to avoid tainting)
      const svgData = new XMLSerializer().serializeToString(svgClone);
      const svgBase64 = btoa(unescape(encodeURIComponent(svgData)));
      const svgDataUrl = "data:image/svg+xml;base64," + svgBase64;

      // Create image and canvas
      const img = new Image();
      img.crossOrigin = "anonymous";

      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = width * 2; // 2x for better quality
          canvas.height = height * 2;

          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "white";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.scale(2, 2);
          ctx.drawImage(img, 0, 0, width, height);

          const pngDataUrl = canvas.toDataURL("image/png");
          resolve({ dataUrl: pngDataUrl, width: width, height: height });
        } catch (canvasError) {
          console.error("[DOCX] Canvas error:", canvasError);
          // Fallback: return SVG data URL
          resolve({
            dataUrl: svgDataUrl,
            width: width,
            height: height,
            isSvg: true,
          });
        }
      };

      img.onerror = (err) => {
        console.error("[DOCX] Image load error:", err);
        reject(new Error("Failed to load SVG as image"));
      };

      img.src = svgDataUrl;
    } catch (error) {
      reject(error);
    }
  });
}

// Store mermaid images for DOCX export
let mermaidImagesForDocx = [];

/**
 * Pre-process mermaid diagrams for DOCX export
 */
async function prepareMermaidForDocx() {
  mermaidImagesForDocx = [];
  const wrappers = editor.querySelectorAll(".mermaid-wrapper");

  for (let i = 0; i < wrappers.length; i++) {
    const wrapper = wrappers[i];
    const svg = wrapper.querySelector("svg");

    if (svg) {
      try {
        const imageData = await svgToPngDataUrl(svg);
        mermaidImagesForDocx.push({
          index: i,
          ...imageData,
        });
      } catch (error) {
        console.error("[DOCX] Failed to convert mermaid SVG:", error);
        mermaidImagesForDocx.push({
          index: i,
          error: true,
        });
      }
    }
  }
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
      // Handle mermaid diagram wrappers
      if (
        element.classList &&
        element.classList.contains("mermaid-wrapper")
      ) {
        // Find the index of this wrapper
        const allWrappers = Array.from(
          editor.querySelectorAll(".mermaid-wrapper")
        );
        const wrapperIndex = allWrappers.indexOf(element);

        // Check if we have pre-rendered image data
        const imageData = mermaidImagesForDocx.find(
          (img) => img.index === wrapperIndex
        );

        if (imageData && !imageData.error && imageData.dataUrl) {
          try {
            // Convert data URL to base64
            const base64Data = imageData.dataUrl.split(",")[1];

            // Scale image to fit DOCX page width (6.5 inches at 96 DPI = 624px)
            const maxDocxWidth = 624;
            let imgWidth = imageData.width;
            let imgHeight = imageData.height;
            if (imgWidth > maxDocxWidth) {
              const scale = maxDocxWidth / imgWidth;
              imgHeight = Math.round(imgHeight * scale);
              imgWidth = maxDocxWidth;
            } else if (imgWidth < maxDocxWidth * 0.5) {
              // Scale up small diagrams to at least 50% of page width
              const scale = (maxDocxWidth * 0.7) / imgWidth;
              imgHeight = Math.round(imgHeight * scale);
              imgWidth = Math.round(imgWidth * scale);
            }

            // Create image for DOCX
            const image = new docx.ImageRun({
              data: Uint8Array.from(atob(base64Data), (c) =>
                c.charCodeAt(0)
              ),
              transformation: {
                width: imgWidth,
                height: imgHeight,
              },
              type: "png",
            });

            paragraphs.push(
              new docx.Paragraph({
                children: [image],
                alignment: docx.AlignmentType.CENTER,
                spacing: { before: 200, after: 200 },
              })
            );
          } catch (error) {
            console.error("[DOCX] Failed to add mermaid image:", error);
            // Fallback: add placeholder text
            paragraphs.push(
              new docx.Paragraph({
                children: [
                  new docx.TextRun({
                    text: "[Mermaid Diagram]",
                    italics: true,
                  }),
                ],
                alignment: docx.AlignmentType.CENTER,
                spacing: { before: 200, after: 200 },
              })
            );
          }
        } else {
          // Fallback: add the source code
          const sourceElement = element.querySelector(".mermaid-source");
          if (sourceElement) {
            const source = sourceElement.textContent || "";
            paragraphs.push(
              new docx.Paragraph({
                children: [
                  new docx.TextRun({
                    text: "[Mermaid Diagram]",
                    italics: true,
                  }),
                ],
                alignment: docx.AlignmentType.CENTER,
                spacing: { before: 200, after: 100 },
              })
            );
          }
        }
      }
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
 * Convert entire editor content to DOCX document
 */
function convertHtmlToDocxElements() {
  const docxElements = [];
  const editorChildren = editor.children;

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

  // Pre-process mermaid diagrams to images
  await prepareMermaidForDocx();

  const title = extractDocxTitle();
  const docxElements = convertHtmlToDocxElements();

  const doc = new docx.Document({
    title: title,
    creator: "Marky Markdown Editor",
    description: "Document created with Marky",
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

// DOCX Button Event Handler
onToolbarAction("export-docx", async (docxBtn) => {
  const loadingIndicator = docxBtn.querySelector(
    ".docx-loading-indicator"
  );
  const btnText = docxBtn.querySelector(".docx-btn-text");

  try {
    docxBtn.disabled = true;
    btnText.style.display = "none";
    loadingIndicator.style.display = "inline-block";

    const result = await generateDOCX();

    btnText.style.display = "inline";
    loadingIndicator.style.display = "none";

    const originalText = btnText.textContent;
    btnText.textContent = "✓ Saved!";
    setTimeout(() => {
      btnText.textContent = originalText;
      docxBtn.disabled = false;
    }, 2000);
  } catch (error) {
    console.error("[DOCX] Error:", error);
    btnText.style.display = "inline";
    loadingIndicator.style.display = "none";

    const originalText = btnText.textContent;
    btnText.textContent = "✗ Failed";
    setTimeout(() => {
      btnText.textContent = originalText;
      docxBtn.disabled = false;
    }, 2000);

    notify(`Failed to generate DOCX: ${error.message}`, { severity: "error" });
  }
});
