(function () {
  "use strict";

  var palette = window.BEAD_PALETTE.map(function (color, index) {
    var rgb = hexToRgb(color.hex);
    return {
      index: index,
      code: color.code,
      hex: color.hex,
      group: color.group,
      rgb: rgb,
      lab: rgbToLab(rgb)
    };
  });

  var els = {
    fileInput: document.getElementById("fileInput"),
    dropZone: document.getElementById("dropZone"),
    fileMeta: document.getElementById("fileMeta"),
    preset: document.getElementById("preset"),
    gridWidth: document.getElementById("gridWidth"),
    gridHeight: document.getElementById("gridHeight"),
    fitMode: document.getElementById("fitMode"),
    styleMode: document.getElementById("styleMode"),
    autoCropSubject: document.getElementById("autoCropSubject"),
    simplifyLevel: document.getElementById("simplifyLevel"),
    edgeStrength: document.getElementById("edgeStrength"),
    maxColors: document.getElementById("maxColors"),
    dither: document.getElementById("dither"),
    backgroundColor: document.getElementById("backgroundColor"),
    cellSize: document.getElementById("cellSize"),
    guideEvery: document.getElementById("guideEvery"),
    showCodes: document.getElementById("showCodes"),
    showGrid: document.getElementById("showGrid"),
    convertBtn: document.getElementById("convertBtn"),
    downloadPng: document.getElementById("downloadPng"),
    downloadSvg: document.getElementById("downloadSvg"),
    downloadCsv: document.getElementById("downloadCsv"),
    printBtn: document.getElementById("printBtn"),
    statusText: document.getElementById("statusText"),
    previewMeta: document.getElementById("previewMeta"),
    resultSize: document.getElementById("resultSize"),
    paletteCount: document.getElementById("paletteCount"),
    emptyState: document.getElementById("emptyState"),
    patternCanvas: document.getElementById("patternCanvas"),
    statsBody: document.getElementById("statsBody"),
    statsSummary: document.getElementById("statsSummary"),
    groupFilter: document.getElementById("groupFilter"),
    paletteGrid: document.getElementById("paletteGrid"),
    resetPalette: document.getElementById("resetPalette")
  };

  var sourceImage = null;
  var sourceName = "";
  var sourceUrl = "";
  var result = null;
  var excludedColors = new Set();
  var enabledGroups = new Set(["f", "g", "h", "i", "j", "k"]);
  var convertTimer = 0;
  var BLANK_CELL = 65535;

  init();

  function init() {
    renderGroupFilter();
    renderPalette();
    bindEvents();
    updatePaletteCount();
    updateStyleControlState();
  }

  function bindEvents() {
    els.fileInput.addEventListener("change", function (event) {
      var file = event.target.files && event.target.files[0];
      if (file) {
        loadFile(file);
      }
    });

    ["dragenter", "dragover"].forEach(function (eventName) {
      els.dropZone.addEventListener(eventName, function (event) {
        event.preventDefault();
        els.dropZone.classList.add("drag-over");
      });
    });

    ["dragleave", "drop"].forEach(function (eventName) {
      els.dropZone.addEventListener(eventName, function (event) {
        event.preventDefault();
        els.dropZone.classList.remove("drag-over");
      });
    });

    els.dropZone.addEventListener("drop", function (event) {
      var file = event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) {
        loadFile(file);
      }
    });

    els.preset.addEventListener("change", function () {
      if (els.preset.value === "64x64-kids") {
        els.gridWidth.value = 64;
        els.gridHeight.value = 64;
        els.styleMode.value = "kids";
        els.maxColors.value = 18;
        els.simplifyLevel.value = 4;
        els.edgeStrength.value = 2;
        els.dither.checked = false;
      } else if (els.preset.value === "50x50") {
        els.gridWidth.value = 50;
        els.gridHeight.value = 50;
      } else if (els.preset.value === "64x64") {
        els.gridWidth.value = 64;
        els.gridHeight.value = 64;
      } else if (els.preset.value === "100x100") {
        els.gridWidth.value = 100;
        els.gridHeight.value = 100;
      }
      updateStyleControlState();
      scheduleConvert();
    });

    [els.gridWidth, els.gridHeight].forEach(function (input) {
      input.addEventListener("input", function () {
        els.preset.value = "custom";
        scheduleConvert();
      });
    });

    [
      els.fitMode,
      els.autoCropSubject,
      els.simplifyLevel,
      els.edgeStrength,
      els.maxColors,
      els.dither,
      els.backgroundColor,
      els.cellSize,
      els.guideEvery,
      els.showCodes,
      els.showGrid
    ].forEach(function (control) {
      control.addEventListener("input", scheduleConvert);
      control.addEventListener("change", scheduleConvert);
    });

    els.styleMode.addEventListener("change", function () {
      applyStyleDefaults();
      scheduleConvert();
    });

    els.convertBtn.addEventListener("click", runConvert);
    els.downloadPng.addEventListener("click", downloadPng);
    els.downloadSvg.addEventListener("click", downloadSvg);
    els.downloadCsv.addEventListener("click", downloadCsv);
    els.printBtn.addEventListener("click", function () {
      window.print();
    });
    els.resetPalette.addEventListener("click", function () {
      excludedColors.clear();
      enabledGroups = new Set(["f", "g", "h", "i", "j", "k"]);
      renderGroupFilter();
      renderPalette();
      updatePaletteCount();
      scheduleConvert();
    });
  }

  function applyStyleDefaults() {
    var maxColors = parseInt(els.maxColors.value, 10) || 0;

    if (els.styleMode.value === "photo") {
      els.simplifyLevel.value = 0;
      els.edgeStrength.value = 0;
      if (maxColors === 0 || maxColors > 60) {
        els.maxColors.value = 40;
      }
      els.dither.checked = false;
    } else if (els.styleMode.value === "kids") {
      if (maxColors > 24 || maxColors === 0) {
        els.maxColors.value = 18;
      }
      els.simplifyLevel.value = Math.max(parseInt(els.simplifyLevel.value, 10) || 0, 3);
      els.edgeStrength.value = Math.max(parseInt(els.edgeStrength.value, 10) || 0, 2);
      els.dither.checked = false;
    } else if (els.styleMode.value === "simple") {
      if (maxColors === 0 || maxColors > 48) {
        els.maxColors.value = 32;
      }
      els.simplifyLevel.value = Math.max(parseInt(els.simplifyLevel.value, 10) || 0, 1);
      els.edgeStrength.value = 0;
      els.dither.checked = false;
    } else if (els.styleMode.value === "outline") {
      if (maxColors === 0 || maxColors > 48) {
        els.maxColors.value = 32;
      }
      els.simplifyLevel.value = Math.max(parseInt(els.simplifyLevel.value, 10) || 0, 2);
      els.edgeStrength.value = Math.max(parseInt(els.edgeStrength.value, 10) || 0, 2);
      els.dither.checked = false;
    } else if (els.styleMode.value === "cartoon") {
      if (maxColors === 0 || maxColors > 36) {
        els.maxColors.value = 24;
      }
      els.simplifyLevel.value = Math.max(parseInt(els.simplifyLevel.value, 10) || 0, 2);
      els.edgeStrength.value = Math.max(parseInt(els.edgeStrength.value, 10) || 0, 1);
      els.dither.checked = false;
    }

    updateStyleControlState();
  }

  function updateStyleControlState() {
    var isPhoto = els.styleMode.value === "photo";
    els.simplifyLevel.disabled = isPhoto;
    els.edgeStrength.disabled = isPhoto;
  }

  function loadFile(file) {
    if (!file.type || file.type.indexOf("image/") !== 0) {
      setStatus("请选择图片文件。", true);
      return;
    }

    if (sourceUrl) {
      URL.revokeObjectURL(sourceUrl);
    }

    var img = new Image();
    sourceUrl = URL.createObjectURL(file);
    sourceName = file.name.replace(/\.[^.]+$/, "") || "pattern";

    img.onload = function () {
      sourceImage = img;
      els.fileMeta.textContent = file.name + " · " + img.naturalWidth + "×" + img.naturalHeight;
      setStatus("图片已载入。");
      runConvert();
    };
    img.onerror = function () {
      setStatus("图片读取失败。", true);
      URL.revokeObjectURL(sourceUrl);
      sourceUrl = "";
    };
    img.src = sourceUrl;
  }

  function scheduleConvert() {
    window.clearTimeout(convertTimer);
    convertTimer = window.setTimeout(runConvert, 160);
  }

  function runConvert() {
    if (!sourceImage) {
      setStatus("等待图片。");
      return;
    }

    var settings = readSettings();
    if (!settings) {
      return;
    }

    var activePalette = getActivePalette();
    if (activePalette.length < 2) {
      setStatus("至少保留 2 个可用色号。", true);
      return;
    }

    setStatus("正在生成...");
    window.setTimeout(function () {
      try {
        var sampled = sampleImage(sourceImage, settings);
        var processed = preprocessSamples(sampled.samples, settings.width, settings.height, settings);
        var selectedPalette = choosePalette(processed.samples, activePalette, settings.maxColors, sampled.blankMask);
        var outlineColor = null;
        if (processed.outlineMap) {
          outlineColor = chooseOutlineColor(activePalette);
          if (!selectedPalette.some(function (color) { return color.index === outlineColor.index; })) {
            selectedPalette = selectedPalette.concat([outlineColor]);
          }
        }
        var mapped = settings.dither
          ? mapWithDither(processed.samples, selectedPalette, settings.width, settings.height, sampled.blankMask)
          : mapDirect(processed.samples, selectedPalette, sampled.blankMask);
        if (!settings.dither && processed.cleanupPasses > 0) {
          mapped.cells = cleanupCells(mapped.cells, settings.width, settings.height, processed.cleanupPasses);
          mapped.counts = countCells(mapped.cells);
        }
        if (processed.outlineMap && outlineColor) {
          mapped.cells = applyOutlineCells(
            mapped.cells,
            processed.outlineMap,
            settings.width,
            settings.height,
            outlineColor.index,
            processed.outlineStrength
          );
          mapped.counts = countCells(mapped.cells);
        }

        result = {
          width: settings.width,
          height: settings.height,
          settings: settings,
          palette: selectedPalette,
          cells: mapped.cells,
          counts: mapped.counts,
          blankMask: sampled.blankMask,
          crop: sampled.crop
        };

        drawPreview();
        renderStats();
        enableExports(true);
        setStatus("已生成。");
      } catch (error) {
        console.error(error);
        setStatus("生成失败：" + error.message, true);
      }
    }, 20);
  }

  function readSettings() {
    var width = clampInt(els.gridWidth.value, 1, 250);
    var height = clampInt(els.gridHeight.value, 1, 250);
    var maxColors = clampInt(els.maxColors.value, 0, palette.length);
    var cellSize = clampInt(els.cellSize.value, 8, 40);
    var guideEvery = clampInt(els.guideEvery.value, 0, 50);
    var simplifyLevel = clampInt(els.simplifyLevel.value, 0, 4);
    var edgeStrength = clampInt(els.edgeStrength.value, 0, 4);

    els.gridWidth.value = width;
    els.gridHeight.value = height;
    els.maxColors.value = maxColors;
    els.cellSize.value = cellSize;
    els.guideEvery.value = guideEvery;
    els.simplifyLevel.value = simplifyLevel;
    els.edgeStrength.value = edgeStrength;

    return {
      width: width,
      height: height,
      fitMode: els.fitMode.value,
      styleMode: els.styleMode.value,
      autoCropSubject: els.autoCropSubject.checked,
      simplifyLevel: simplifyLevel,
      edgeStrength: edgeStrength,
      maxColors: maxColors,
      dither: els.dither.checked,
      backgroundColor: els.backgroundColor.value,
      cellSize: cellSize,
      guideEvery: guideEvery,
      showCodes: els.showCodes.checked,
      showGrid: els.showGrid.checked
    };
  }

  function sampleImage(image, settings) {
    var canvas = document.createElement("canvas");
    canvas.width = settings.width;
    canvas.height = settings.height;
    var ctx = canvas.getContext("2d", { willReadFrequently: true });
    var bg = hexToRgb(settings.backgroundColor);
    ctx.clearRect(0, 0, settings.width, settings.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    var crop = getSourceCrop(image, settings);
    var placement = getImagePlacement(
      crop.width,
      crop.height,
      settings.width,
      settings.height,
      settings.fitMode
    );
    ctx.drawImage(
      image,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      placement.x,
      placement.y,
      placement.width,
      placement.height
    );

    var data = ctx.getImageData(0, 0, settings.width, settings.height).data;
    var samples = new Float32Array(settings.width * settings.height * 3);
    var blankMask = buildBlankMask(data, settings.width, settings.height, bg);

    for (var i = 0, j = 0; i < data.length; i += 4, j += 3) {
      var alpha = data[i + 3] / 255;
      samples[j] = data[i] * alpha + bg.r * (1 - alpha);
      samples[j + 1] = data[i + 1] * alpha + bg.g * (1 - alpha);
      samples[j + 2] = data[i + 2] * alpha + bg.b * (1 - alpha);
    }

    return {
      samples: samples,
      blankMask: blankMask,
      crop: crop
    };
  }

  function buildBlankMask(data, width, height, bg) {
    var cellCount = width * height;
    var blank = new Uint8Array(cellCount);
    var candidates = new Uint8Array(cellCount);
    var visited = new Uint8Array(cellCount);
    var thresholdSq = 30 * 30;

    for (var cell = 0; cell < cellCount; cell += 1) {
      var i = cell * 4;
      var alpha = data[i + 3];
      var alphaRatio = alpha / 255;
      var r = data[i] * alphaRatio + bg.r * (1 - alphaRatio);
      var g = data[i + 1] * alphaRatio + bg.g * (1 - alphaRatio);
      var b = data[i + 2] * alphaRatio + bg.b * (1 - alphaRatio);
      var dr = r - bg.r;
      var dg = g - bg.g;
      var db = b - bg.b;

      if (alpha <= 12) {
        blank[cell] = 1;
        candidates[cell] = 1;
      } else if (dr * dr + dg * dg + db * db <= thresholdSq) {
        candidates[cell] = 1;
      }
    }

    var queue = [];
    function pushIfCandidate(index) {
      if (candidates[index] && !visited[index]) {
        visited[index] = 1;
        blank[index] = 1;
        queue.push(index);
      }
    }

    for (var x = 0; x < width; x += 1) {
      pushIfCandidate(x);
      pushIfCandidate((height - 1) * width + x);
    }
    for (var y = 0; y < height; y += 1) {
      pushIfCandidate(y * width);
      pushIfCandidate(y * width + width - 1);
    }

    for (var head = 0; head < queue.length; head += 1) {
      var current = queue[head];
      var cx = current % width;
      if (cx > 0) {
        pushIfCandidate(current - 1);
      }
      if (cx < width - 1) {
        pushIfCandidate(current + 1);
      }
      if (current >= width) {
        pushIfCandidate(current - width);
      }
      if (current < cellCount - width) {
        pushIfCandidate(current + width);
      }
    }

    return blank;
  }

  function getSourceCrop(image, settings) {
    var full = {
      x: 0,
      y: 0,
      width: image.naturalWidth,
      height: image.naturalHeight,
      applied: false
    };

    if (!settings.autoCropSubject) {
      return full;
    }

    var maxSide = 900;
    var scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    var width = Math.max(1, Math.round(image.naturalWidth * scale));
    var height = Math.max(1, Math.round(image.naturalHeight * scale));
    var canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);

    var imageData = ctx.getImageData(0, 0, width, height);
    var bounds = detectSubjectBounds(imageData.data, width, height);
    if (!bounds) {
      return full;
    }

    var crop = {
      x: Math.round(bounds.x / scale),
      y: Math.round(bounds.y / scale),
      width: Math.round(bounds.width / scale),
      height: Math.round(bounds.height / scale),
      applied: true
    };
    crop.x = Math.max(0, Math.min(image.naturalWidth - 1, crop.x));
    crop.y = Math.max(0, Math.min(image.naturalHeight - 1, crop.y));
    crop.width = Math.max(1, Math.min(image.naturalWidth - crop.x, crop.width));
    crop.height = Math.max(1, Math.min(image.naturalHeight - crop.y, crop.height));
    return crop;
  }

  function detectSubjectBounds(data, width, height) {
    var stride = Math.max(1, Math.floor(Math.max(width, height) / 420));
    var transparentPixels = 0;
    var checkedPixels = 0;

    for (var alphaIndex = 3; alphaIndex < data.length; alphaIndex += 4 * stride) {
      checkedPixels += 1;
      if (data[alphaIndex] < 245) {
        transparentPixels += 1;
      }
    }

    if (transparentPixels > checkedPixels * 0.01) {
      return boundsFromPredicate(width, height, stride, function (x, y) {
        return data[(y * width + x) * 4 + 3] > 24;
      });
    }

    var border = sampleBorderStats(data, width, height, stride);
    var threshold = Math.max(28, border.meanDistance + border.stdDistance * 2.25);
    var thresholdSq = threshold * threshold;
    return boundsFromPredicate(width, height, stride, function (x, y) {
      var i = (y * width + x) * 4;
      var dr = data[i] - border.r;
      var dg = data[i + 1] - border.g;
      var db = data[i + 2] - border.b;
      return dr * dr + dg * dg + db * db > thresholdSq;
    });
  }

  function sampleBorderStats(data, width, height, stride) {
    var pixels = [];
    var totalR = 0;
    var totalG = 0;
    var totalB = 0;

    function addPixel(x, y) {
      var i = (y * width + x) * 4;
      var pixel = { r: data[i], g: data[i + 1], b: data[i + 2] };
      pixels.push(pixel);
      totalR += pixel.r;
      totalG += pixel.g;
      totalB += pixel.b;
    }

    for (var x = 0; x < width; x += stride) {
      addPixel(x, 0);
      addPixel(x, height - 1);
    }
    for (var y = 0; y < height; y += stride) {
      addPixel(0, y);
      addPixel(width - 1, y);
    }

    var r = totalR / pixels.length;
    var g = totalG / pixels.length;
    var b = totalB / pixels.length;
    var totalDistance = 0;
    var distances = pixels.map(function (pixel) {
      var dr = pixel.r - r;
      var dg = pixel.g - g;
      var db = pixel.b - b;
      var distance = Math.sqrt(dr * dr + dg * dg + db * db);
      totalDistance += distance;
      return distance;
    });
    var meanDistance = totalDistance / distances.length;
    var variance = distances.reduce(function (total, distance) {
      var diff = distance - meanDistance;
      return total + diff * diff;
    }, 0) / distances.length;

    return {
      r: r,
      g: g,
      b: b,
      meanDistance: meanDistance,
      stdDistance: Math.sqrt(variance)
    };
  }

  function boundsFromPredicate(width, height, stride, predicate) {
    var minX = width;
    var minY = height;
    var maxX = -1;
    var maxY = -1;
    var hits = 0;

    for (var y = 0; y < height; y += stride) {
      for (var x = 0; x < width; x += stride) {
        if (predicate(x, y)) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
          hits += 1;
        }
      }
    }

    if (hits === 0) {
      return null;
    }

    var detectedWidth = maxX - minX + 1;
    var detectedHeight = maxY - minY + 1;
    var detectedArea = detectedWidth * detectedHeight;
    var imageArea = width * height;
    if (detectedArea < imageArea * 0.01 || detectedArea > imageArea * 0.92) {
      return null;
    }

    var pad = Math.round(Math.max(detectedWidth, detectedHeight) * 0.09);
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(width - 1, maxX + pad);
    maxY = Math.min(height - 1, maxY + pad);

    return {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1
    };
  }

  function getImagePlacement(srcW, srcH, dstW, dstH, fitMode) {
    if (fitMode === "stretch") {
      return { x: 0, y: 0, width: dstW, height: dstH };
    }

    var scale = fitMode === "contain"
      ? Math.min(dstW / srcW, dstH / srcH)
      : Math.max(dstW / srcW, dstH / srcH);
    var width = srcW * scale;
    var height = srcH * scale;

    return {
      x: (dstW - width) / 2,
      y: (dstH - height) / 2,
      width: width,
      height: height
    };
  }

  function preprocessSamples(samples, width, height, settings) {
    if (settings.styleMode === "photo") {
      return {
        samples: new Float32Array(samples),
        cleanupPasses: 0,
        outlineMap: null,
        outlineStrength: 0
      };
    }

    var work = new Float32Array(samples);
    var simplify = settings.simplifyLevel;
    var edgeStrength = settings.edgeStrength;
    var blurPasses = 0;
    var cleanupPasses = simplify;
    var outlineMap = null;
    var outlineStrength = 0;
    var posterizeLevel = 0;
    var saturation = 1;
    var contrast = 1;

    if (settings.styleMode === "kids") {
      blurPasses = 3 + simplify;
      cleanupPasses = 3 + simplify * 2;
      edgeStrength += 1;
      outlineStrength = Math.max(2, edgeStrength);
      posterizeLevel = Math.max(4, 7 - simplify);
      saturation = 1.22;
      contrast = 1.12;
    } else if (settings.styleMode === "simple") {
      blurPasses = simplify > 0 ? 1 + Math.floor(simplify / 3) : 0;
      saturation = 1.04;
      contrast = 1.03;
    } else if (settings.styleMode === "cartoon") {
      blurPasses = 1 + Math.ceil(simplify / 2);
      cleanupPasses = 1 + simplify;
      edgeStrength += 1;
      saturation = 1.18;
      contrast = 1.08;
    } else if (settings.styleMode === "outline") {
      blurPasses = Math.max(1, Math.ceil(simplify / 2));
      cleanupPasses = simplify;
      edgeStrength += 2;
      outlineStrength = edgeStrength;
      saturation = 1.08;
      contrast = 1.08;
    }

    var edgeMap = edgeStrength > 0 ? computeEdgeMap(samples, width, height) : null;
    if (blurPasses > 0) {
      work = boxBlurSamples(work, width, height, blurPasses);
    }
    if (saturation !== 1 || contrast !== 1) {
      adjustColor(work, saturation, contrast);
    }
    if (posterizeLevel > 0) {
      posterizeSamples(work, posterizeLevel);
    }
    if (edgeMap) {
      applyEdgeDarkening(work, edgeMap, edgeStrength);
    }
    if (outlineStrength > 0 && edgeMap) {
      outlineMap = buildOutlineMap(edgeMap, width, height, outlineStrength);
    }

    return {
      samples: work,
      cleanupPasses: cleanupPasses,
      outlineMap: outlineMap,
      outlineStrength: outlineStrength
    };
  }

  function boxBlurSamples(samples, width, height, passes) {
    var src = new Float32Array(samples);
    var dst = new Float32Array(samples.length);

    for (var pass = 0; pass < passes; pass += 1) {
      for (var y = 0; y < height; y += 1) {
        for (var x = 0; x < width; x += 1) {
          var totalR = 0;
          var totalG = 0;
          var totalB = 0;
          var totalWeight = 0;

          for (var oy = -1; oy <= 1; oy += 1) {
            var py = y + oy;
            if (py < 0 || py >= height) {
              continue;
            }
            for (var ox = -1; ox <= 1; ox += 1) {
              var px = x + ox;
              if (px < 0 || px >= width) {
                continue;
              }
              var weight = ox === 0 && oy === 0 ? 2 : 1;
              var i = (py * width + px) * 3;
              totalR += src[i] * weight;
              totalG += src[i + 1] * weight;
              totalB += src[i + 2] * weight;
              totalWeight += weight;
            }
          }

          var out = (y * width + x) * 3;
          dst[out] = totalR / totalWeight;
          dst[out + 1] = totalG / totalWeight;
          dst[out + 2] = totalB / totalWeight;
        }
      }
      var swap = src;
      src = dst;
      dst = swap;
    }

    return src;
  }

  function adjustColor(samples, saturation, contrast) {
    for (var i = 0; i < samples.length; i += 3) {
      var r = samples[i];
      var g = samples[i + 1];
      var b = samples[i + 2];
      var luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = luma + (r - luma) * saturation;
      g = luma + (g - luma) * saturation;
      b = luma + (b - luma) * saturation;
      samples[i] = clampChannel((r - 128) * contrast + 128);
      samples[i + 1] = clampChannel((g - 128) * contrast + 128);
      samples[i + 2] = clampChannel((b - 128) * contrast + 128);
    }
  }

  function posterizeSamples(samples, levels) {
    var step = 255 / (levels - 1);
    for (var i = 0; i < samples.length; i += 3) {
      samples[i] = Math.round(samples[i] / step) * step;
      samples[i + 1] = Math.round(samples[i + 1] / step) * step;
      samples[i + 2] = Math.round(samples[i + 2] / step) * step;
    }
  }

  function computeEdgeMap(samples, width, height) {
    var gray = new Float32Array(width * height);
    var edges = new Float32Array(width * height);

    for (var i = 0, p = 0; i < samples.length; i += 3, p += 1) {
      gray[p] = 0.2126 * samples[i] + 0.7152 * samples[i + 1] + 0.0722 * samples[i + 2];
    }

    for (var y = 1; y < height - 1; y += 1) {
      for (var x = 1; x < width - 1; x += 1) {
        var p00 = gray[(y - 1) * width + x - 1];
        var p01 = gray[(y - 1) * width + x];
        var p02 = gray[(y - 1) * width + x + 1];
        var p10 = gray[y * width + x - 1];
        var p12 = gray[y * width + x + 1];
        var p20 = gray[(y + 1) * width + x - 1];
        var p21 = gray[(y + 1) * width + x];
        var p22 = gray[(y + 1) * width + x + 1];
        var gx = -p00 + p02 - 2 * p10 + 2 * p12 - p20 + p22;
        var gy = -p00 - 2 * p01 - p02 + p20 + 2 * p21 + p22;
        edges[y * width + x] = Math.sqrt(gx * gx + gy * gy);
      }
    }

    return edges;
  }

  function buildOutlineMap(edgeMap, width, height, strength) {
    var values = Array.from(edgeMap).filter(function (value) {
      return value > 0;
    });
    var outline = new Uint8Array(width * height);
    if (!values.length) {
      return outline;
    }

    values.sort(function (a, b) {
      return a - b;
    });
    var percentile = Math.max(0.8, 0.95 - strength * 0.03);
    var threshold = values[Math.floor(values.length * percentile)] || values[values.length - 1];
    if (!threshold) {
      return outline;
    }

    for (var y = 1; y < height - 1; y += 1) {
      for (var x = 1; x < width - 1; x += 1) {
        var index = y * width + x;
        var edge = edgeMap[index];
        if (edge <= threshold) {
          continue;
        }

        var horizontalMax = Math.max(edgeMap[index - 1], edgeMap[index + 1]);
        var verticalMax = Math.max(edgeMap[index - width], edgeMap[index + width]);
        if (edge >= horizontalMax || edge >= verticalMax) {
          outline[index] = 1;
        }
      }
    }

    if (strength >= 5) {
      outline = softenOutlineGaps(outline, width, height);
    }

    return outline;
  }

  function softenOutlineGaps(outline, width, height) {
    var next = new Uint8Array(outline);
    for (var y = 1; y < height - 1; y += 1) {
      for (var x = 1; x < width - 1; x += 1) {
        var index = y * width + x;
        if (outline[index]) {
          continue;
        }
        var horizontal = outline[index - 1] + outline[index + 1];
        var vertical = outline[index - width] + outline[index + width];
        if (horizontal === 2 || vertical === 2) {
          next[index] = 1;
        }
      }
    }
    return next;
  }

  function applyEdgeDarkening(samples, edgeMap, strength) {
    var values = Array.from(edgeMap).filter(function (value) {
      return value > 0;
    });
    if (!values.length) {
      return;
    }

    values.sort(function (a, b) {
      return a - b;
    });
    var percentile = Math.max(0.68, 0.93 - strength * 0.055);
    var threshold = values[Math.floor(values.length * percentile)] || values[values.length - 1];
    if (!threshold) {
      return;
    }

    var baseAmount = Math.min(0.42, 0.08 + strength * 0.07);
    for (var cell = 0; cell < edgeMap.length; cell += 1) {
      var edge = edgeMap[cell];
      if (edge <= threshold) {
        continue;
      }
      var t = Math.min(1, (edge - threshold) / (threshold * 1.4 + 1));
      var amount = Math.min(0.68, baseAmount + t * 0.24);
      var i = cell * 3;
      samples[i] *= 1 - amount;
      samples[i + 1] *= 1 - amount;
      samples[i + 2] *= 1 - amount;
    }
  }

  function choosePalette(samples, activePalette, maxColors, blankMask) {
    if (!maxColors || maxColors >= activePalette.length) {
      return activePalette.slice();
    }

    var counts = new Map();
    for (var i = 0, cell = 0; i < samples.length; i += 3, cell += 1) {
      if (blankMask && blankMask[cell]) {
        continue;
      }
      var nearest = nearestPaletteColor(samples[i], samples[i + 1], samples[i + 2], activePalette);
      counts.set(nearest.index, (counts.get(nearest.index) || 0) + 1);
    }

    var ranked = activePalette
      .filter(function (color) {
        return counts.has(color.index);
      })
      .sort(function (a, b) {
        return counts.get(b.index) - counts.get(a.index);
      });

    if (!ranked.length) {
      return activePalette.slice(0, Math.max(2, maxColors));
    }

    return ranked.slice(0, Math.max(2, maxColors));
  }

  function mapDirect(samples, selectedPalette, blankMask) {
    var cellCount = samples.length / 3;
    var cells = new Uint16Array(cellCount);
    var counts = new Map();

    for (var i = 0, cell = 0; i < samples.length; i += 3, cell += 1) {
      if (blankMask && blankMask[cell]) {
        cells[cell] = BLANK_CELL;
        continue;
      }
      var nearest = nearestPaletteColor(samples[i], samples[i + 1], samples[i + 2], selectedPalette);
      cells[cell] = nearest.index;
      counts.set(nearest.index, (counts.get(nearest.index) || 0) + 1);
    }

    return { cells: cells, counts: counts };
  }

  function mapWithDither(samples, selectedPalette, width, height, blankMask) {
    var work = new Float32Array(samples);
    var cells = new Uint16Array(width * height);
    var counts = new Map();

    for (var y = 0; y < height; y += 1) {
      for (var x = 0; x < width; x += 1) {
        var cell = y * width + x;
        if (blankMask && blankMask[cell]) {
          cells[cell] = BLANK_CELL;
          continue;
        }
        var pixel = (y * width + x) * 3;
        var r = clampChannel(work[pixel]);
        var g = clampChannel(work[pixel + 1]);
        var b = clampChannel(work[pixel + 2]);
        var nearest = nearestPaletteColor(r, g, b, selectedPalette);
        cells[cell] = nearest.index;
        counts.set(nearest.index, (counts.get(nearest.index) || 0) + 1);

        var er = r - nearest.rgb.r;
        var eg = g - nearest.rgb.g;
        var eb = b - nearest.rgb.b;
        addError(work, width, height, x + 1, y, er, eg, eb, 7 / 16, blankMask);
        addError(work, width, height, x - 1, y + 1, er, eg, eb, 3 / 16, blankMask);
        addError(work, width, height, x, y + 1, er, eg, eb, 5 / 16, blankMask);
        addError(work, width, height, x + 1, y + 1, er, eg, eb, 1 / 16, blankMask);
      }
    }

    return { cells: cells, counts: counts };
  }

  function cleanupCells(cells, width, height, passes) {
    var current = new Uint16Array(cells);
    var next = new Uint16Array(cells.length);

    for (var pass = 0; pass < passes; pass += 1) {
      next.set(current);
      for (var y = 0; y < height; y += 1) {
        for (var x = 0; x < width; x += 1) {
          var index = y * width + x;
          var currentColor = current[index];
          if (currentColor === BLANK_CELL) {
            continue;
          }
          var counts = new Map();

          for (var oy = -1; oy <= 1; oy += 1) {
            var py = y + oy;
            if (py < 0 || py >= height) {
              continue;
            }
            for (var ox = -1; ox <= 1; ox += 1) {
              var px = x + ox;
              if (px < 0 || px >= width) {
                continue;
              }
              var color = current[py * width + px];
              if (color === BLANK_CELL) {
                continue;
              }
              counts.set(color, (counts.get(color) || 0) + 1);
            }
          }

          var bestColor = currentColor;
          var bestCount = counts.get(currentColor) || 0;
          counts.forEach(function (count, color) {
            if (count > bestCount) {
              bestColor = color;
              bestCount = count;
            }
          });

          if (bestColor !== currentColor && bestCount >= 5) {
            next[index] = bestColor;
          }
        }
      }
      var swap = current;
      current = next;
      next = swap;
    }

    return current;
  }

  function applyOutlineCells(cells, outlineMap, width, height, outlineColorIndex, strength) {
    var next = new Uint16Array(cells);
    var protectedCells = new Uint8Array(cells.length);

    for (var i = 0; i < outlineMap.length; i += 1) {
      if (outlineMap[i] && next[i] !== BLANK_CELL) {
        next[i] = outlineColorIndex;
        protectedCells[i] = 1;
      }
    }

    if (strength >= 5) {
      for (var y = 1; y < height - 1; y += 1) {
        for (var x = 1; x < width - 1; x += 1) {
          var index = y * width + x;
          if (!outlineMap[index] || next[index] === BLANK_CELL) {
            continue;
          }
          if (outlineMap[index - 1] || outlineMap[index + 1]) {
            var down = index + width;
            if (!protectedCells[down] && next[down] !== BLANK_CELL) {
              next[down] = outlineColorIndex;
            }
          }
          if (outlineMap[index - width] || outlineMap[index + width]) {
            var right = index + 1;
            if (!protectedCells[right] && next[right] !== BLANK_CELL) {
              next[right] = outlineColorIndex;
            }
          }
        }
      }
    }

    return next;
  }

  function countCells(cells) {
    var counts = new Map();
    for (var i = 0; i < cells.length; i += 1) {
      if (cells[i] === BLANK_CELL) {
        continue;
      }
      counts.set(cells[i], (counts.get(cells[i]) || 0) + 1);
    }
    return counts;
  }

  function getBeadTotal(counts) {
    var total = 0;
    counts.forEach(function (count) {
      total += count;
    });
    return total;
  }

  function addError(work, width, height, x, y, er, eg, eb, factor, blankMask) {
    if (x < 0 || x >= width || y < 0 || y >= height) {
      return;
    }
    if (blankMask && blankMask[y * width + x]) {
      return;
    }
    var i = (y * width + x) * 3;
    work[i] += er * factor;
    work[i + 1] += eg * factor;
    work[i + 2] += eb * factor;
  }

  function nearestPaletteColor(r, g, b, colorList) {
    var lab = rgbToLab({ r: r, g: g, b: b });
    var best = colorList[0];
    var bestDistance = Infinity;

    for (var i = 0; i < colorList.length; i += 1) {
      var distance = deltaE76(lab, colorList[i].lab);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = colorList[i];
      }
    }

    return best;
  }

  function chooseOutlineColor(colorList) {
    return colorList.reduce(function (best, color) {
      var bestScore = outlineColorScore(best);
      var score = outlineColorScore(color);
      return score < bestScore ? color : best;
    }, colorList[0]);
  }

  function outlineColorScore(color) {
    var rgb = color.rgb;
    var max = Math.max(rgb.r, rgb.g, rgb.b);
    var min = Math.min(rgb.r, rgb.g, rgb.b);
    var saturation = max === 0 ? 0 : (max - min) / max;
    return getLuminance(rgb) * 1.4 + saturation * 0.12;
  }

  function drawPreview() {
    if (!result) {
      return;
    }

    drawPattern(els.patternCanvas, {
      cellSize: result.settings.cellSize,
      showCodes: result.settings.showCodes,
      showGrid: result.settings.showGrid,
      guideEvery: result.settings.guideEvery
    });

    els.patternCanvas.style.display = "block";
    els.emptyState.style.display = "none";
    els.previewMeta.textContent =
      sourceName +
      " · " +
      result.width +
      "×" +
      result.height +
      " · " +
      getStyleLabel(result.settings.styleMode) +
      (result.crop.applied ? " · 主体裁剪" : "");
    els.resultSize.textContent =
      result.width +
      " × " +
      result.height +
      " · " +
      getBeadTotal(result.counts) +
      " 颗 · " +
      result.counts.size +
      " 色";
  }

  function drawPattern(canvas, options) {
    var width = result.width;
    var height = result.height;
    var cellSize = options.cellSize;
    var canvasWidth = width * cellSize;
    var canvasHeight = height * cellSize;
    var ctx = canvas.getContext("2d");

    canvas.width = canvasWidth + (options.showGrid ? 1 : 0);
    canvas.height = canvasHeight + (options.showGrid ? 1 : 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (var y = 0; y < height; y += 1) {
      for (var x = 0; x < width; x += 1) {
        var cellIndex = result.cells[y * width + x];
        if (cellIndex === BLANK_CELL) {
          continue;
        }
        var color = palette[cellIndex];
        ctx.fillStyle = color.hex;
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      }
    }

    if (options.showCodes && cellSize >= 10) {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "700 " + Math.max(7, Math.floor(cellSize * 0.34)) + "px sans-serif";
      for (var labelY = 0; labelY < height; labelY += 1) {
        for (var labelX = 0; labelX < width; labelX += 1) {
          var labelCell = result.cells[labelY * width + labelX];
          if (labelCell === BLANK_CELL) {
            continue;
          }
          var labelColor = palette[labelCell];
          ctx.fillStyle = getTextColor(labelColor.rgb);
          ctx.fillText(
            labelColor.code,
            labelX * cellSize + cellSize / 2,
            labelY * cellSize + cellSize / 2,
            cellSize - 2
          );
        }
      }
    }

    if (options.showGrid) {
      drawGrid(ctx, width, height, cellSize, options.guideEvery);
    }
  }

  function drawGrid(ctx, width, height, cellSize, guideEvery) {
    ctx.save();
    ctx.translate(0.5, 0.5);
    ctx.strokeStyle = "rgba(20, 24, 28, 0.32)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var x = 0; x <= width; x += 1) {
      ctx.moveTo(x * cellSize, 0);
      ctx.lineTo(x * cellSize, height * cellSize);
    }
    for (var y = 0; y <= height; y += 1) {
      ctx.moveTo(0, y * cellSize);
      ctx.lineTo(width * cellSize, y * cellSize);
    }
    ctx.stroke();

    if (guideEvery > 0) {
      ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (var guideX = guideEvery; guideX < width; guideX += guideEvery) {
        ctx.moveTo(guideX * cellSize, 0);
        ctx.lineTo(guideX * cellSize, height * cellSize);
      }
      for (var guideY = guideEvery; guideY < height; guideY += guideEvery) {
        ctx.moveTo(0, guideY * cellSize);
        ctx.lineTo(width * cellSize, guideY * cellSize);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function renderStats() {
    if (!result) {
      return;
    }

    var total = getBeadTotal(result.counts);
    var rows = Array.from(result.counts.entries())
      .map(function (entry) {
        var color = palette[entry[0]];
        return { color: color, count: entry[1] };
      })
      .sort(function (a, b) {
        return b.count - a.count || a.color.code.localeCompare(b.color.code);
      });

    els.statsBody.innerHTML = "";
    if (total === 0) {
      els.statsBody.innerHTML = "<tr><td colspan=\"6\">没有需要摆放的豆子。</td></tr>";
      els.statsSummary.textContent = "0 颗 · 0 色";
      return;
    }

    rows.forEach(function (row) {
      var tr = document.createElement("tr");
      var percent = ((row.count / total) * 100).toFixed(1) + "%";
      var bags = Math.ceil(row.count / 1000);
      tr.innerHTML =
        "<td><span class=\"swatch-cell\"><span class=\"mini-swatch\" style=\"background:" +
        row.color.hex +
        "\"></span>" +
        escapeHtml(row.color.code) +
        "</span></td><td>" +
        "盒 " +
        escapeHtml(row.color.group) +
        "</td><td>" +
        row.color.hex +
        "</td><td>" +
        row.count +
        "</td><td>" +
        percent +
        "</td><td>" +
        bags +
        "</td>";
      els.statsBody.appendChild(tr);
    });

    els.statsSummary.textContent = total + " 颗 · " + rows.length + " 色";
  }

  function renderGroupFilter() {
    els.groupFilter.innerHTML = "";
    ["f", "g", "h", "i", "j", "k"].forEach(function (group) {
      var label = document.createElement("label");
      var checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = enabledGroups.has(group);
      checkbox.addEventListener("change", function () {
        if (checkbox.checked) {
          enabledGroups.add(group);
        } else {
          enabledGroups.delete(group);
        }
        renderPalette();
        updatePaletteCount();
        scheduleConvert();
      });
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode("套餐 " + group));
      els.groupFilter.appendChild(label);
    });
  }

  function renderPalette() {
    els.paletteGrid.innerHTML = "";
    palette.forEach(function (color) {
      var isActive = enabledGroups.has(color.group) && !excludedColors.has(color.index);
      var button = document.createElement("button");
      button.type = "button";
      button.className = "swatch-button" + (getLuminance(color.rgb) < 0.45 ? " dark" : "");
      button.style.backgroundColor = color.hex;
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
      button.title = color.code + " " + color.hex + " · 套餐 " + color.group;
      button.textContent = color.code;
      button.addEventListener("click", function () {
        if (excludedColors.has(color.index)) {
          excludedColors.delete(color.index);
        } else {
          excludedColors.add(color.index);
        }
        renderPalette();
        updatePaletteCount();
        scheduleConvert();
      });
      els.paletteGrid.appendChild(button);
    });
  }

  function getActivePalette() {
    return palette.filter(function (color) {
      return enabledGroups.has(color.group) && !excludedColors.has(color.index);
    });
  }

  function updatePaletteCount() {
    els.paletteCount.textContent = getActivePalette().length + " / " + palette.length + " 色";
  }

  function enableExports(enabled) {
    els.downloadPng.disabled = !enabled;
    els.downloadSvg.disabled = !enabled;
    els.downloadCsv.disabled = !enabled;
    els.printBtn.disabled = !enabled;
  }

  function downloadPng() {
    if (!result) {
      return;
    }
    var canvas = document.createElement("canvas");
    drawPattern(canvas, {
      cellSize: result.settings.cellSize,
      showCodes: result.settings.showCodes,
      showGrid: result.settings.showGrid,
      guideEvery: result.settings.guideEvery
    });
    canvas.toBlob(function (blob) {
      if (blob) {
        downloadBlob(blob, safeFileName(sourceName) + "-拼豆图纸.png");
      }
    }, "image/png");
  }

  function downloadSvg() {
    if (!result) {
      return;
    }
    var svg = buildSvg(result.settings);
    downloadBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), safeFileName(sourceName) + "-拼豆图纸.svg");
  }

  function downloadCsv() {
    if (!result) {
      return;
    }

    var total = getBeadTotal(result.counts);
    var rows = Array.from(result.counts.entries())
      .map(function (entry) {
        var color = palette[entry[0]];
        var percent = total > 0 ? ((entry[1] / total) * 100).toFixed(2) + "%" : "0.00%";
        return [color.code, color.group, color.hex, entry[1], percent, Math.ceil(entry[1] / 1000)];
      })
      .sort(function (a, b) {
        return b[3] - a[3] || a[0].localeCompare(b[0]);
      });
    var csv = "\ufeff色号,盒号,HEX,数量,占比,估算包数(1000颗/包)\n" + rows.map(csvRow).join("\n");
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), safeFileName(sourceName) + "-用量.csv");
  }

  function buildSvg(settings) {
    var cellSize = settings.cellSize;
    var width = result.width * cellSize;
    var height = result.height * cellSize;
    var parts = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
        width +
        '" height="' +
        height +
        '" viewBox="0 0 ' +
        width +
        " " +
        height +
        '">',
      '<rect width="100%" height="100%" fill="#ffffff"/>'
    ];

    for (var y = 0; y < result.height; y += 1) {
      for (var x = 0; x < result.width; x += 1) {
        var cellIndex = result.cells[y * result.width + x];
        if (cellIndex === BLANK_CELL) {
          continue;
        }
        var color = palette[cellIndex];
        parts.push(
          '<rect x="' +
            x * cellSize +
            '" y="' +
            y * cellSize +
            '" width="' +
            cellSize +
            '" height="' +
            cellSize +
            '" fill="' +
            color.hex +
            '"/>'
        );
      }
    }

    if (settings.showCodes && cellSize >= 10) {
      var fontSize = Math.max(7, Math.floor(cellSize * 0.34));
      parts.push('<g font-family="sans-serif" font-weight="700" font-size="' + fontSize + '" text-anchor="middle" dominant-baseline="central">');
      for (var labelY = 0; labelY < result.height; labelY += 1) {
        for (var labelX = 0; labelX < result.width; labelX += 1) {
          var labelCell = result.cells[labelY * result.width + labelX];
          if (labelCell === BLANK_CELL) {
            continue;
          }
          var labelColor = palette[labelCell];
          parts.push(
            '<text x="' +
              (labelX * cellSize + cellSize / 2) +
              '" y="' +
              (labelY * cellSize + cellSize / 2) +
              '" fill="' +
              getTextColor(labelColor.rgb) +
              '">' +
              escapeHtml(labelColor.code) +
              "</text>"
          );
        }
      }
      parts.push("</g>");
    }

    if (settings.showGrid) {
      parts.push('<g stroke="rgba(20,24,28,0.32)" stroke-width="1" fill="none">');
      for (var gridX = 0; gridX <= result.width; gridX += 1) {
        parts.push('<path d="M' + gridX * cellSize + " 0V" + height + '"/>');
      }
      for (var gridY = 0; gridY <= result.height; gridY += 1) {
        parts.push('<path d="M0 ' + gridY * cellSize + "H" + width + '"/>');
      }
      parts.push("</g>");

      if (settings.guideEvery > 0) {
        parts.push('<g stroke="#000000" stroke-width="2" fill="none">');
        for (var guideX = settings.guideEvery; guideX < result.width; guideX += settings.guideEvery) {
          parts.push('<path d="M' + guideX * cellSize + " 0V" + height + '"/>');
        }
        for (var guideY = settings.guideEvery; guideY < result.height; guideY += settings.guideEvery) {
          parts.push('<path d="M0 ' + guideY * cellSize + "H" + width + '"/>');
        }
        parts.push("</g>");
      }
    }

    parts.push("</svg>");
    return parts.join("");
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function setStatus(message, isError) {
    els.statusText.textContent = message;
    els.statusText.style.color = isError ? "var(--danger)" : "var(--muted)";
  }

  function getStyleLabel(styleMode) {
    if (styleMode === "kids") {
      return "儿童画简化";
    }
    if (styleMode === "cartoon") {
      return "卡通块面";
    }
    if (styleMode === "outline") {
      return "轮廓强化";
    }
    if (styleMode === "photo") {
      return "原图匹配";
    }
    return "轻度简化";
  }

  function hexToRgb(hex) {
    var normalized = hex.replace("#", "");
    return {
      r: parseInt(normalized.slice(0, 2), 16),
      g: parseInt(normalized.slice(2, 4), 16),
      b: parseInt(normalized.slice(4, 6), 16)
    };
  }

  function rgbToLab(rgb) {
    var r = pivotRgb(rgb.r / 255);
    var g = pivotRgb(rgb.g / 255);
    var b = pivotRgb(rgb.b / 255);

    var x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
    var y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
    var z = r * 0.0193339 + g * 0.119192 + b * 0.9503041;

    x = pivotXyz(x / 0.95047);
    y = pivotXyz(y / 1.0);
    z = pivotXyz(z / 1.08883);

    return {
      l: 116 * y - 16,
      a: 500 * (x - y),
      b: 200 * (y - z)
    };
  }

  function pivotRgb(value) {
    return value > 0.04045 ? Math.pow((value + 0.055) / 1.055, 2.4) : value / 12.92;
  }

  function pivotXyz(value) {
    return value > 0.008856 ? Math.pow(value, 1 / 3) : 7.787 * value + 16 / 116;
  }

  function deltaE76(a, b) {
    var dl = a.l - b.l;
    var da = a.a - b.a;
    var db = a.b - b.b;
    return dl * dl + da * da + db * db;
  }

  function getLuminance(rgb) {
    function channel(value) {
      value /= 255;
      return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    }
    return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
  }

  function getTextColor(rgb) {
    return getLuminance(rgb) > 0.48 ? "#111111" : "#ffffff";
  }

  function clampInt(value, min, max) {
    var parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
      parsed = min;
    }
    return Math.min(max, Math.max(min, parsed));
  }

  function clampChannel(value) {
    return Math.max(0, Math.min(255, value));
  }

  function safeFileName(name) {
    return (name || "pattern").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function csvRow(row) {
    return row.map(function (value) {
      var text = String(value);
      if (/[",\n]/.test(text)) {
        return '"' + text.replace(/"/g, '""') + '"';
      }
      return text;
    }).join(",");
  }
})();
