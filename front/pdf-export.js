function generatePDFFilename() {
  const firstHeading = editor.querySelector("h1");
  const title = slugifyTitle(firstHeading && firstHeading.textContent, "marky");
  return `${title}-${Date.now()}.pdf`;
}

async function compressImage(imgElement, maxSizeBytes = 1048576) {
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    canvas.width = imgElement.naturalWidth || imgElement.width;
    canvas.height = imgElement.naturalHeight || imgElement.height;

    ctx.drawImage(imgElement, 0, 0);

    let quality = 0.95;
    let compressedDataUrl = canvas.toDataURL("image/jpeg", quality);

    while (compressedDataUrl.length > maxSizeBytes * 1.37 && quality > 0.1) {
      quality -= 0.05;
      compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
    }

    const originalSize = imgElement.src.length;
    const compressedSize = compressedDataUrl.length;

    return {
      dataUrl: compressedDataUrl,
      originalSize: originalSize,
      compressedSize: compressedSize,
      quality: quality,
      wasCompressed: compressedSize < originalSize,
    };
  } catch (error) {
    console.warn("[PDF] Image compression failed:", error);
    return {
      dataUrl: imgElement.src,
      originalSize: imgElement.src.length,
      compressedSize: imgElement.src.length,
      quality: 1.0,
      wasCompressed: false,
      error: error.message,
    };
  }
}

async function processImages(element) {
  const images = element.querySelectorAll("img");
  const warnings = [];

  for (let img of images) {
    const originalSrc = img.src;

    if (img.src.length > 1048576 * 1.37) {
      const result = await compressImage(img);

      if (result.wasCompressed) {
        img.src = result.dataUrl;
        warnings.push(
          `Image compressed from ${(result.originalSize / 1024).toFixed(
            0,
          )}KB to ${(result.compressedSize / 1024).toFixed(0)}KB`,
        );
      } else if (result.error) {
        warnings.push(`Failed to compress image: ${result.error}`);
      }
    }
  }

  return warnings;
}

async function generatePDF() {
  try {
    await ensureHtml2Pdf();
  } catch (error) {
    throw new Error("Could not load the PDF library. Check your connection.");
  }

  const element = editor.cloneNode(true);
  const filename = generatePDFFilename();

  // Create a temporary wrapper to hold the cloned element
  // Must be visible for html2canvas to render properly
  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.left = "-10000px"; // Off-screen but must be rendered
  wrapper.style.top = "0";
  wrapper.style.width = "210mm"; // A4 width
  wrapper.style.background = "#ffffff";
  wrapper.style.padding = "20px";
  wrapper.style.zIndex = "-1";

  // Apply light mode styles to cloned element
  element.style.background = "#ffffff";
  element.style.color = "#333333";
  element.style.border = "none";
  element.style.margin = "0";
  element.style.padding = "0";
  element.style.width = "100%";
  element.style.fontFamily =
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";
  element.style.fontSize = "16px";
  element.style.lineHeight = "1.6";

  // Force light mode colors on all child elements
  const allElements = element.querySelectorAll("*");
  allElements.forEach((el) => {
    // Reset color to inherit from parent
    el.style.color = "#333333";

    // Fix specific elements that might have CSS variable colors
    if (el.tagName === "H1" || el.tagName === "H2" || el.tagName === "H3") {
      el.style.color = "#2c3e50";
      el.style.fontWeight = "bold";
    } else if (el.tagName === "A") {
      el.style.color = "#3498db";
    } else if (el.tagName === "CODE") {
      el.style.backgroundColor = "#f4f4f4";
      el.style.color = "#e74c3c";
      el.style.padding = "2px 4px";
    } else if (el.tagName === "PRE") {
      el.style.backgroundColor = "#f4f4f4";
      el.style.color = "#333333";
      el.style.padding = "10px";
    } else if (el.tagName === "BLOCKQUOTE") {
      el.style.borderLeftColor = "#3498db";
      el.style.backgroundColor = "#f9f9f9";
      el.style.color = "#666666";
    } else if (el.tagName === "TH" || el.tagName === "TD") {
      el.style.borderColor = "#ddd";
      el.style.color = "#333333";
    }
  });

  // Fix Mermaid diagram scaling for PDF
  const mermaidWrappers = element.querySelectorAll(".mermaid-wrapper");
  mermaidWrappers.forEach((wrapper) => {
    wrapper.style.background = "#ffffff";
    wrapper.style.padding = "10px";
    wrapper.style.margin = "10px 0";
    wrapper.style.textAlign = "center";
    wrapper.style.overflow = "visible";

    const svg = wrapper.querySelector("svg");
    if (svg) {
      // Get original dimensions
      const viewBox = svg.getAttribute("viewBox");
      const originalWidth = svg.getAttribute("width");
      const originalHeight = svg.getAttribute("height");

      // Set max width to fit page and maintain aspect ratio
      svg.style.maxWidth = "100%";
      svg.style.height = "auto";
      svg.style.display = "block";
      svg.style.margin = "0 auto";

      // Remove any fixed dimensions that might cause overflow
      if (originalWidth && parseFloat(originalWidth) > 600) {
        svg.setAttribute("width", "100%");
        svg.removeAttribute("height");
      }
    }
  });

  // Add to DOM temporarily
  wrapper.appendChild(element);
  document.body.appendChild(wrapper);

  try {
    // Give browser time to compute styles and layout
    await new Promise((resolve) => setTimeout(resolve, 200));

    const warnings = await processImages(element);

    const options = {
      margin: [10, 10, 10, 10],
      filename: filename,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        scrollX: 0,
        scrollY: 0,
        backgroundColor: "#ffffff",
        letterRendering: true,
        allowTaint: false,
        removeContainer: false,
      },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    };

    await html2pdf().set(options).from(element).save();
    return { success: true, filename: filename, warnings: warnings };
  } catch (error) {
    console.error("[PDF] PDF generation failed:", error);
    throw error;
  } finally {
    // Always remove the temporary wrapper from DOM
    if (wrapper.parentNode) {
      document.body.removeChild(wrapper);
    }
  }
}

// The spinner used to live in the button, as a ⏳ swapped in for its label.
// That button is a menu item now and the menu closes on the click, so the one
// export that takes seconds would appear to do nothing at all. A toast held
// open for the duration says it better than the button ever did — notify()
// returns its own dismiss function for exactly this.
onToolbarAction("export-pdf", async (pdfBtn) => {
  if (pdfBtn) pdfBtn.disabled = true;
  const done = notify("Generating PDF…", { severity: "info", timeout: 0 });

  try {
    await generatePDF();
    done();
    notify("PDF saved.", { severity: "success" });
  } catch (error) {
    done();
    notify(`Failed to generate PDF: ${error.message}`, { severity: "error" });
  } finally {
    if (pdfBtn) pdfBtn.disabled = false;
  }
});
