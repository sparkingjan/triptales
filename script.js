(function () {
  document.documentElement.style.colorScheme = "light";
  if (document.body) {
    document.body.classList.remove("dark");
  }

  var header = document.getElementById("siteHeader");
  var menuToggle = document.getElementById("menuToggle");
  var navLinks = document.getElementById("navLinks");
  var revealItems = document.querySelectorAll(".reveal");
  var counters = document.querySelectorAll("[data-counter]");
  var filterChips = document.querySelectorAll(".tt-filter-chip");
  var authStorageTokenKey = "triptales_auth_token";
  var authStorageUserKey = "triptales_auth_user";

  function getAuthToken() {
    try {
      return String(localStorage.getItem(authStorageTokenKey) || "");
    } catch (e) {
      return "";
    }
  }

  function getAuthUser() {
    try {
      var raw = localStorage.getItem(authStorageUserKey);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function setAuthSession(token, user) {
    try {
      localStorage.setItem(authStorageTokenKey, String(token || ""));
      localStorage.setItem(authStorageUserKey, JSON.stringify(user || {}));
    } catch (e) {}
  }

  function clearAuthSession() {
    try {
      localStorage.removeItem(authStorageTokenKey);
      localStorage.removeItem(authStorageUserKey);
    } catch (e) {}
  }

  function buildAuthHeaders() {
    var token = getAuthToken();
    var headers = { "Content-Type": "application/json" };
    if (token) {
      headers.Authorization = "Bearer " + token;
    }
    return headers;
  }

  function getApiBase() {
    if (window.location.protocol === "file:") {
      return "https://triptales-wvb8.onrender.com";
    }
    var host = String(window.location.hostname || "").toLowerCase();
    var port = String(window.location.port || "");
    var localHost = host === "localhost" || host === "127.0.0.1";
    if (localHost && port && port !== "8000") {
      return "https://triptales-wvb8.onrender.com";
    }
    if (!host) {
      return "https://triptales-wvb8.onrender.com";
    }
    return "";
  }

  function apiUrl(path) {
    return getApiBase() + path;
  }

  function resolveApiAssetUrl(path) {
    var raw = String(path || "").trim();
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.charAt(0) !== "/") return raw;
    return getApiBase() + raw;
  }

  function initNavigationAuthState() {
    var user = getAuthUser();
    var role = String((user && user.role) || "").toLowerCase();
    var navScopes = Array.prototype.slice.call(document.querySelectorAll("header nav, .site-header nav, .navbar, #navLinks"));
    if (!navScopes.length) return;

    function isAdminHref(anchor) {
      var href = String(anchor.getAttribute("href") || "").trim().toLowerCase();
      return href === "admin.html" || href === "./admin.html" || href.endsWith("/admin.html");
    }

    function isLoginHref(anchor) {
      var href = String(anchor.getAttribute("href") || "").trim().toLowerCase();
      return href === "login.html" || href === "./login.html" || href.endsWith("/login.html");
    }

    navScopes.forEach(function (scope) {
      var anchors = Array.prototype.slice.call(scope.querySelectorAll("a[href]"));

      anchors.forEach(function (anchor) {
        if (!isAdminHref(anchor)) return;
        var adminItem = anchor.closest("li");
        if (adminItem) {
          adminItem.style.display = role === "admin" ? "" : "none";
        } else {
          anchor.style.display = role === "admin" ? "" : "none";
        }
      });

      anchors.forEach(function (anchor) {
        if (!isLoginHref(anchor) && anchor.getAttribute("data-auth-link") !== "logout") return;

        if (user) {
          anchor.textContent = "Logout";
          anchor.setAttribute("href", "#");
          anchor.setAttribute("data-auth-link", "logout");
          if (!anchor.getAttribute("data-logout-bound")) {
            anchor.setAttribute("data-logout-bound", "1");
            anchor.addEventListener("click", function (event) {
              event.preventDefault();
              clearAuthSession();
              window.location.href = "index.html";
            });
          }
        } else {
          anchor.textContent = "Login";
          anchor.setAttribute("href", "login.html");
          anchor.setAttribute("data-auth-link", "login");
          anchor.removeAttribute("data-logout-bound");
        }
      });
    });
  }

  function updateHeaderState() {
    if (!header) return;
    if (window.scrollY > 16) {
      header.classList.add("scrolled");
    } else {
      header.classList.remove("scrolled");
    }
  }

  updateHeaderState();
  window.addEventListener("scroll", updateHeaderState);

  if (menuToggle && navLinks) {
    menuToggle.addEventListener("click", function () {
      var isOpen = navLinks.classList.toggle("open");
      menuToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    navLinks.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        navLinks.classList.remove("open");
        menuToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  if ("IntersectionObserver" in window && revealItems.length) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("visible");
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.15 });

    revealItems.forEach(function (item) {
      revealObserver.observe(item);
    });
  } else {
    revealItems.forEach(function (item) {
      item.classList.add("visible");
    });
  }

  function animateCounter(el, target) {
    var duration = 1400;
    var startTime = null;

    function tick(timestamp) {
      if (!startTime) startTime = timestamp;
      var progress = Math.min((timestamp - startTime) / duration, 1);
      var value = Math.floor(target * progress);

      if (target === 98) {
        el.textContent = value + "%";
      } else {
        el.textContent = new Intl.NumberFormat("en-IN").format(value) + "+";
      }

      if (progress < 1) {
        window.requestAnimationFrame(tick);
      }
    }

    window.requestAnimationFrame(tick);
  }

  if (counters.length) {
    var hasAnimatedCounters = false;
    var counterObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting || hasAnimatedCounters) return;
        hasAnimatedCounters = true;
        counters.forEach(function (counter) {
          animateCounter(counter, Number(counter.getAttribute("data-counter") || 0));
        });
      });
    }, { threshold: 0.3 });

    counterObserver.observe(counters[0]);
  }

  filterChips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      filterChips.forEach(function (item) {
        item.classList.remove("active");
        item.setAttribute("aria-pressed", "false");
      });
      chip.classList.add("active");
      chip.setAttribute("aria-pressed", "true");
    });
  });

  // Navigate itinerary cards to the dedicated details page.
  document.addEventListener("click", function (event) {
    var detailsBtn = event.target.closest(".view-details-btn");
    if (!detailsBtn) return;
    var itineraryId = String(detailsBtn.getAttribute("data-itinerary") || "").trim();
    if (!itineraryId) {
      window.location.href = "itinerary-details.html";
      return;
    }
    window.location.href = "itinerary-details.html?itinerary=" + encodeURIComponent(itineraryId);
  });

  function initExploreEnhancements() {
    var itineraryGrid = document.getElementById("itineraryGrid");
    if (!itineraryGrid) return;

    var exploreLayout = document.querySelector(".explore-layout");
    var compareWindow = document.getElementById("compareWindow");
    var compareSummary = document.getElementById("compareSummary");
    var compareTableWrap = document.getElementById("compareTableWrap");
    var compareColA = document.getElementById("compareColA");
    var compareColB = document.getElementById("compareColB");
    var compareColC = document.getElementById("compareColC");
    var savedList = document.getElementById("savedList");
    var savedEmpty = document.getElementById("savedEmpty");
    var savedKey = "triptales_saved_itineraries_v1";
    var selectedForCompare = [];
    var savedItems = {};

    function readSavedItems() {
      try {
        var raw = localStorage.getItem(savedKey);
        var parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch (e) {
        return {};
      }
    }

    function persistSavedItems() {
      try {
        localStorage.setItem(savedKey, JSON.stringify(savedItems));
      } catch (e) {}
    }

    function getCardData(card) {
      var titleEl = card.querySelector("h3");
      var pEls = card.querySelectorAll("p");
      var duration = "";
      var budget = "";
      var type = "";
      pEls.forEach(function (p) {
        var txt = String(p.textContent || "").trim();
        if (txt.indexOf("Duration:") === 0) duration = txt.replace("Duration:", "").trim();
        if (txt.indexOf("Budget:") === 0) budget = txt.replace("Budget:", "").trim();
        if (txt.indexOf("Type:") === 0) type = txt.replace("Type:", "").trim();
      });
      return {
        title: titleEl ? String(titleEl.textContent || "").trim() : "Unknown Itinerary",
        duration: duration || "-",
        budget: budget || "-",
        type: type || "-",
        slug: card.querySelector(".view-details-btn") ? String(card.querySelector(".view-details-btn").getAttribute("data-itinerary") || "") : ""
      };
    }

    function setCompareCell(id, value) {
      var el = document.getElementById(id);
      if (el) el.textContent = value || "-";
    }

    function updateCompareUI() {
      if (!compareSummary) return;
      if (selectedForCompare.length < 2) {
        compareSummary.textContent = "Select at least two itineraries from the cards to compare.";
        if (compareTableWrap) compareTableWrap.classList.add("hidden");
        if (compareWindow) compareWindow.classList.add("hidden");
        if (exploreLayout) exploreLayout.classList.remove("has-compare");
        return;
      }

      var first = selectedForCompare[0];
      var second = selectedForCompare[1];
      var third = selectedForCompare[2] || null;
      compareSummary.textContent = third
        ? "Comparing " + first.title + ", " + second.title + ", and " + third.title + "."
        : "Comparing " + first.title + " and " + second.title + ".";
      if (compareColA) compareColA.textContent = first.title;
      if (compareColB) compareColB.textContent = second.title;
      if (compareColC) {
        compareColC.classList.toggle("hidden", !third);
        compareColC.textContent = third ? third.title : "Itinerary C";
      }

      setCompareCell("cmpDurationA", first.duration);
      setCompareCell("cmpDurationB", second.duration);
      setCompareCell("cmpDurationC", third ? third.duration : "-");
      setCompareCell("cmpBudgetA", first.budget);
      setCompareCell("cmpBudgetB", second.budget);
      setCompareCell("cmpBudgetC", third ? third.budget : "-");
      setCompareCell("cmpTypeA", first.type);
      setCompareCell("cmpTypeB", second.type);
      setCompareCell("cmpTypeC", third ? third.type : "-");
      setCompareCell("cmpRatingA", "4.8/5");
      setCompareCell("cmpRatingB", "4.7/5");
      setCompareCell("cmpRatingC", third ? "4.6/5" : "-");

      ["cmpDurationC", "cmpBudgetC", "cmpTypeC", "cmpRatingC"].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.classList.toggle("hidden", !third);
      });

      if (compareTableWrap) compareTableWrap.classList.remove("hidden");
      if (compareWindow) compareWindow.classList.remove("hidden");
      if (exploreLayout) exploreLayout.classList.add("has-compare");
    }

    function renderSavedList() {
      if (!savedList || !savedEmpty) return;
      savedList.innerHTML = "";
      var keys = Object.keys(savedItems);
      if (!keys.length) {
        savedEmpty.classList.remove("hidden");
        return;
      }
      savedEmpty.classList.add("hidden");
      keys.forEach(function (title) {
        var item = savedItems[title];
        var row = document.createElement("div");
        row.className = "saved-item";
        row.innerHTML = '<strong></strong><a class="btn btn-small btn-primary" href="#">Open</a>';
        row.querySelector("strong").textContent = title;
        var open = row.querySelector("a");
        open.href = "itinerary-details.html?itinerary=" + encodeURIComponent(item.slug || "");
        savedList.appendChild(row);
      });
    }

    savedItems = readSavedItems();

    itineraryGrid.querySelectorAll(".itinerary-card").forEach(function (card) {
      var content = card.querySelector(".itinerary-card-content");
      if (!content || content.querySelector(".card-tools")) return;
      var data = getCardData(card);
      var wrap = document.createElement("div");
      wrap.className = "card-tools";
      wrap.innerHTML = [
        '<label class="compare-check"><input type="checkbox" class="compare-toggle" /> Compare</label>',
        '<button type="button" class="btn btn-small save-toggle">Save</button>',
        '<button type="button" class="btn btn-small arvr-toggle" disabled title="AR/VR coming soon">AR/VR</button>'
      ].join("");
      content.appendChild(wrap);

      var compareToggle = wrap.querySelector(".compare-toggle");
      var saveToggle = wrap.querySelector(".save-toggle");

      compareToggle.addEventListener("change", function () {
        if (compareToggle.checked) {
          if (selectedForCompare.length >= 3) {
            compareToggle.checked = false;
            return;
          }
          selectedForCompare.push(data);
        } else {
          selectedForCompare = selectedForCompare.filter(function (item) { return item.slug !== data.slug; });
        }
        updateCompareUI();
      });

      function updateSaveButtonState() {
        var isSaved = !!savedItems[data.title];
        saveToggle.textContent = isSaved ? "Saved" : "Save";
        saveToggle.classList.toggle("btn-primary", isSaved);
      }

      saveToggle.addEventListener("click", function () {
        if (savedItems[data.title]) {
          delete savedItems[data.title];
        } else {
          savedItems[data.title] = { slug: data.slug, title: data.title };
        }
        persistSavedItems();
        renderSavedList();
        updateSaveButtonState();
      });

      updateSaveButtonState();
    });

    renderSavedList();

  }

  function initExploreSearchFiltering() {
    var searchInput = document.getElementById("filterSearch");
    var itineraryGrid = document.getElementById("itineraryGrid");
    if (!searchInput || !itineraryGrid) return;

    var resultsCount = document.getElementById("filterResultsCount");
    var noResults = document.getElementById("filterNoResults");
    var resetBtn = document.getElementById("filterResetBtn");

    function applySearchFilter() {
      var query = String(searchInput.value || "").trim().toLowerCase();
      var cards = Array.prototype.slice.call(itineraryGrid.querySelectorAll(".itinerary-card"));
      var visibleCount = 0;

      cards.forEach(function (card) {
        var text = String(card.textContent || "").toLowerCase();
        var isMatch = !query || text.indexOf(query) >= 0;
        card.style.display = isMatch ? "" : "none";
        if (isMatch) visibleCount += 1;
      });

      if (resultsCount) {
        if (!query) {
          resultsCount.textContent = "Showing all itineraries (" + visibleCount + ")";
        } else {
          resultsCount.textContent = "Showing " + visibleCount + " itineraries for \"" + String(searchInput.value || "").trim() + "\"";
        }
      }
      if (noResults) {
        noResults.classList.toggle("hidden", visibleCount !== 0);
      }
    }

    window.__applyExploreSearchFilter = applySearchFilter;

    searchInput.addEventListener("input", applySearchFilter);
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        searchInput.value = "";
        applySearchFilter();
      });
    }

    var queryParam = new URLSearchParams(window.location.search).get("q");
    if (queryParam) {
      searchInput.value = queryParam;
    }
    applySearchFilter();
  }

  function initApprovedExploreCards() {
    var itineraryGrid = document.getElementById("itineraryGrid");
    if (!itineraryGrid) return;

    fetch(apiUrl("/api/itineraries?status=approved&limit=100"))
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          if (!response.ok) throw new Error(String((data && data.error) || "Failed to load approved itineraries."));
          return data;
        });
      })
      .then(function (data) {
        var items = Array.isArray(data && data.items) ? data.items : [];
        items.forEach(function (item) {
        var slug = String(item.id || "").trim();
        if (!item || !item.id || itineraryGrid.querySelector('[data-itinerary="' + slug + '"]')) return;
        var imageUrl = resolveApiAssetUrl((item.proof && item.proof.photo && item.proof.photo.url) || "images/1.1.jpg.jpeg");

        var article = document.createElement("article");
        article.className = "itinerary-card visible";
        article.innerHTML = [
          '<img src="' + imageUrl + '" alt="' + String(item.title || "Approved itinerary") + '" />',
          '<div class="itinerary-card-content">',
          "<h3>" + String(item.title || "Approved Itinerary") + "</h3>",
          "<p>Duration: " + String(item.duration || "-") + "</p>",
          "<p>Budget: " + String(item.budget || "-") + "</p>",
            "<p>Type: Community Approved</p>",
            '<a class="btn btn-primary view-details-btn" href="itinerary-details.html?itinerary=' + encodeURIComponent(slug) + '" data-itinerary="' + slug + '">View Details</a>',
            "</div>"
          ].join("");
          itineraryGrid.insertBefore(article, itineraryGrid.firstChild);
        });
        if (typeof window.__applyExploreSearchFilter === "function") {
          window.__applyExploreSearchFilter();
        }
      })
      .catch(function () {});
  }

  function initExploreBackendSummary() {
    var resultsCount = document.getElementById("filterResultsCount");
    var itineraryGrid = document.getElementById("itineraryGrid");
    if (!resultsCount || !itineraryGrid) return;

    fetch(apiUrl("/api/itineraries?status=approved&limit=1"))
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          if (!response.ok) throw new Error("Failed");
          return data;
        });
      })
      .then(function (data) {
        var approved = Number((data && data.total) || 0);
        if (approved > 0) {
          resultsCount.textContent = "Showing curated itineraries + " + approved + " approved community submissions";
        }
      })
      .catch(function () {});
  }

  function initHomeSearchBar() {
    var input = document.getElementById("homeSearchInput");
    var button = document.getElementById("homeSearchBtn");
    if (!input || !button) return;

    function triggerSearch() {
      var query = String(input.value || "").trim();
      if (!query) return;
      window.location.href = "explore.html?q=" + encodeURIComponent(query);
    }

    button.addEventListener("click", triggerSearch);
    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        triggerSearch();
      }
    });
  }


  function initMiniForms() {
    document.querySelectorAll(".mini-form").forEach(function (form) {
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        var outputId = form.getAttribute("data-output");
        var output = outputId ? document.getElementById(outputId) : null;
        if (output) {
          output.textContent = "Request staged successfully. Status saved at " + new Date().toLocaleTimeString("en-IN");
        }
      });
    });
  }

  function initCreateItineraryProof() {
    var form = document.getElementById("createItineraryForm");
    if (!form) return;

    var enableLocationBtn = document.getElementById("enableLocationBtn");
    var locationStatus = document.getElementById("locationProofStatus");
    var startCameraBtn = document.getElementById("startCameraBtn");
    var capturePhotoBtn = document.getElementById("capturePhotoBtn");
    var retakePhotoBtn = document.getElementById("retakePhotoBtn");
    var uploadCapturedPhotoBtn = document.getElementById("uploadCapturedPhotoBtn");
    var photoStatus = document.getElementById("photoProofStatus");
    var cameraPreview = document.getElementById("itineraryCameraPreview");
    var capturedPreview = document.getElementById("itineraryCapturedPreview");
    var cameraFallbackHint = document.getElementById("cameraFallbackHint");
    var captureCanvas = document.getElementById("itineraryCaptureCanvas");
    var latitudeInput = document.getElementById("locationLatitudeInput");
    var longitudeInput = document.getElementById("locationLongitudeInput");
    var capturedPhotoInput = document.getElementById("capturedPhotoInput");
    var createItineraryStatus = document.getElementById("createItineraryStatus");
    var submitBtn = form.querySelector('button[type="submit"]');

    if (
      !enableLocationBtn ||
      !startCameraBtn ||
      !capturePhotoBtn ||
      !retakePhotoBtn ||
      !uploadCapturedPhotoBtn ||
      !cameraPreview ||
      !capturedPreview ||
      !captureCanvas ||
      !latitudeInput ||
      !longitudeInput ||
      !capturedPhotoInput
    ) {
      return;
    }

    var state = {
      hasLocation: false,
      hasCapturedPhoto: false,
      hasUploadedPhoto: false,
      stream: null,
      capturedObjectUrl: ""
    };
    var isSubmitting = false;

    function setStatus(el, text, tone) {
      if (!el) return;
      el.textContent = text || "";
      el.classList.remove("success", "error", "warn");
      if (tone === "success" || tone === "error" || tone === "warn") {
        el.classList.add(tone);
      }
    }

    function updateFallbackHint() {
      if (!cameraFallbackHint) return;
      var showHint = cameraPreview.classList.contains("hidden") && capturedPreview.classList.contains("hidden");
      cameraFallbackHint.classList.toggle("hidden", !showHint);
    }

    function stopCamera() {
      if (state.stream) {
        state.stream.getTracks().forEach(function (track) {
          track.stop();
        });
        state.stream = null;
      }
      cameraPreview.srcObject = null;
      cameraPreview.classList.add("hidden");
      capturePhotoBtn.disabled = true;
      startCameraBtn.disabled = false;
      updateFallbackHint();
    }

    function updateSubmitState() {
      if (!submitBtn) return;
      if (isSubmitting) {
        submitBtn.disabled = true;
        submitBtn.title = "Submitting itinerary...";
        return;
      }
      var canSubmit = state.hasLocation && state.hasUploadedPhoto;
      submitBtn.disabled = !canSubmit;
      if (canSubmit) {
        submitBtn.removeAttribute("title");
      } else {
        submitBtn.title = "Enable location and upload a captured photo first.";
      }
    }

    function readFormValue(fieldName) {
      var field = form.elements[fieldName];
      return field ? String(field.value || "").trim() : "";
    }

    function buildCreatePayload() {
      return {
        title: readFormValue("title"),
        route: readFormValue("route"),
        duration: readFormValue("duration"),
        budget: readFormValue("budget"),
        highlights: readFormValue("highlights"),
        locationLatitude: Number(latitudeInput.value),
        locationLongitude: Number(longitudeInput.value),
        capturedPhotoDataUrl: String(capturedPhotoInput.value || "")
      };
    }

    function clearCapturedPhotoState() {
      if (state.capturedObjectUrl) {
        URL.revokeObjectURL(state.capturedObjectUrl);
      }
      state.capturedObjectUrl = "";
      state.hasCapturedPhoto = false;
      state.hasUploadedPhoto = false;
      capturedPhotoInput.value = "";
      capturedPreview.removeAttribute("src");
      capturedPreview.classList.add("hidden");
      uploadCapturedPhotoBtn.disabled = true;
      retakePhotoBtn.classList.add("hidden");
      updateFallbackHint();
      updateSubmitState();
    }

    async function openCamera() {
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
        setStatus(photoStatus, "Camera is not supported on this device/browser.", "error");
        return;
      }

      stopCamera();
      clearCapturedPhotoState();
      setStatus(photoStatus, "Opening camera...", "warn");

      try {
        var stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment"
          },
          audio: false
        });
        state.stream = stream;
        cameraPreview.srcObject = stream;
        cameraPreview.classList.remove("hidden");
        capturePhotoBtn.disabled = false;
        startCameraBtn.disabled = true;
        updateFallbackHint();
        setStatus(photoStatus, "Camera is active. Capture and upload your photo.", "warn");
      } catch (error) {
        setStatus(photoStatus, "Camera permission denied or unavailable.", "error");
      }
    }

    function readCapturedPhotoAsDataUrl(blob) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () {
          resolve(String(reader.result || ""));
        };
        reader.onerror = function () {
          reject(new Error("Failed to read captured photo."));
        };
        reader.readAsDataURL(blob);
      });
    }

    function capturePhoto() {
      if (!state.stream) {
        setStatus(photoStatus, "Open camera first.", "error");
        return;
      }

      var width = cameraPreview.videoWidth || 1280;
      var height = cameraPreview.videoHeight || 720;
      captureCanvas.width = width;
      captureCanvas.height = height;

      var ctx = captureCanvas.getContext("2d");
      if (!ctx) {
        setStatus(photoStatus, "Unable to capture image on this browser.", "error");
        return;
      }

      ctx.drawImage(cameraPreview, 0, 0, width, height);
      captureCanvas.toBlob(function (blob) {
        if (!blob) {
          setStatus(photoStatus, "Capture failed. Try again.", "error");
          return;
        }

        if (state.capturedObjectUrl) {
          URL.revokeObjectURL(state.capturedObjectUrl);
        }
        state.capturedObjectUrl = URL.createObjectURL(blob);
        state.hasCapturedPhoto = true;
        state.hasUploadedPhoto = false;
        capturedPhotoInput.value = "";

        capturedPreview.src = state.capturedObjectUrl;
        capturedPreview.classList.remove("hidden");
        retakePhotoBtn.classList.remove("hidden");
        uploadCapturedPhotoBtn.disabled = false;
        setStatus(photoStatus, "Photo captured. Click Upload Photo.", "warn");

        stopCamera();
        updateFallbackHint();
        updateSubmitState();
      }, "image/jpeg", 0.92);
    }

    async function uploadCapturedPhoto() {
      if (!state.hasCapturedPhoto) {
        setStatus(photoStatus, "Capture a photo before uploading.", "error");
        return;
      }

      try {
        var blob = await new Promise(function (resolve) {
          captureCanvas.toBlob(function (fileBlob) {
            resolve(fileBlob);
          }, "image/jpeg", 0.92);
        });

        if (!blob) {
          setStatus(photoStatus, "Unable to prepare photo for upload.", "error");
          return;
        }

        var dataUrl = await readCapturedPhotoAsDataUrl(blob);
        capturedPhotoInput.value = dataUrl;
        state.hasUploadedPhoto = true;
        uploadCapturedPhotoBtn.disabled = true;
        setStatus(photoStatus, "Photo uploaded and linked to this itinerary.", "success");
        updateSubmitState();
      } catch (error) {
        setStatus(photoStatus, "Upload failed. Please capture again.", "error");
      }
    }

    function requestLocation() {
      if (!navigator.geolocation || typeof navigator.geolocation.getCurrentPosition !== "function") {
        setStatus(locationStatus, "Geolocation is not supported on this browser.", "error");
        return;
      }

      enableLocationBtn.disabled = true;
      setStatus(locationStatus, "Requesting location access...", "warn");

      navigator.geolocation.getCurrentPosition(
        function (position) {
          var latitude = Number(position && position.coords ? position.coords.latitude : NaN);
          var longitude = Number(position && position.coords ? position.coords.longitude : NaN);
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            enableLocationBtn.disabled = false;
            setStatus(locationStatus, "Unable to read a valid location.", "error");
            return;
          }

          state.hasLocation = true;
          latitudeInput.value = latitude.toFixed(6);
          longitudeInput.value = longitude.toFixed(6);
          setStatus(
            locationStatus,
            "Location verified: " + latitude.toFixed(5) + ", " + longitude.toFixed(5),
            "success"
          );
          enableLocationBtn.textContent = "Location Verified";
          updateSubmitState();
        },
        function (error) {
          state.hasLocation = false;
          latitudeInput.value = "";
          longitudeInput.value = "";
          enableLocationBtn.disabled = false;

          var message = "Location permission failed.";
          if (error && error.code === 1) message = "Location permission denied. Turn it on and try again.";
          if (error && error.code === 2) message = "Location unavailable. Try again outdoors or with better signal.";
          if (error && error.code === 3) message = "Location request timed out. Try again.";
          setStatus(locationStatus, message, "error");
          updateSubmitState();
        },
        {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 0
        }
      );
    }

    enableLocationBtn.addEventListener("click", requestLocation);
    startCameraBtn.addEventListener("click", openCamera);
    capturePhotoBtn.addEventListener("click", capturePhoto);
    retakePhotoBtn.addEventListener("click", function () {
      clearCapturedPhotoState();
      openCamera();
    });
    uploadCapturedPhotoBtn.addEventListener("click", uploadCapturedPhoto);

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      if (isSubmitting) return;

      if (!state.hasLocation) {
        setStatus(locationStatus, "Enable location before submitting itinerary.", "error");
        return;
      }

      if (!state.hasUploadedPhoto || !capturedPhotoInput.value) {
        setStatus(photoStatus, "Capture and upload a photo before submitting itinerary.", "error");
        return;
      }

      var payload = buildCreatePayload();
      if (
        !payload.title ||
        !payload.route ||
        !payload.duration ||
        !payload.budget ||
        !payload.highlights ||
        !Number.isFinite(payload.locationLatitude) ||
        !Number.isFinite(payload.locationLongitude) ||
        !payload.capturedPhotoDataUrl
      ) {
        setStatus(createItineraryStatus, "Please complete all itinerary and proof fields before submitting.", "error");
        updateSubmitState();
        return;
      }

      isSubmitting = true;
      updateSubmitState();
      setStatus(createItineraryStatus, "Submitting itinerary to backend...", "warn");

      fetch(apiUrl("/api/itineraries"), {
        method: "POST",
        headers: buildAuthHeaders(),
        body: JSON.stringify(payload)
      })
        .then(function (response) {
          return response.json().catch(function () {
            return {};
          }).then(function (data) {
            if (!response.ok) {
              var message = String((data && (data.error || data.details)) || "Failed to submit itinerary.");
              throw new Error(message);
            }
            return data;
          });
        })
        .then(function (data) {
          var createdId = data && data.itinerary ? String(data.itinerary.id || "") : "";
          var successMessage = createdId
            ? "Itinerary submitted successfully. ID: " + createdId
            : "Itinerary submitted successfully.";
          setStatus(createItineraryStatus, successMessage, "success");

          form.reset();
          stopCamera();
          clearCapturedPhotoState();

          state.hasLocation = false;
          latitudeInput.value = "";
          longitudeInput.value = "";
          enableLocationBtn.disabled = false;
          enableLocationBtn.textContent = "Turn On Location";

          setStatus(locationStatus, "Location not verified yet.");
          setStatus(photoStatus, "No photo uploaded yet.");
        })
        .catch(function (error) {
          setStatus(createItineraryStatus, String((error && error.message) || "Submission failed."), "error");
        })
        .finally(function () {
          isSubmitting = false;
          updateSubmitState();
        });
    });

    window.addEventListener("beforeunload", function () {
      stopCamera();
      if (state.capturedObjectUrl) {
        URL.revokeObjectURL(state.capturedObjectUrl);
      }
    });

    updateFallbackHint();
    updateSubmitState();
  }

  function initAuthForms() {
    var loginForm = document.getElementById("loginForm");
    var signupForm = document.getElementById("signupForm");
    if (!loginForm || !signupForm) return;

    var tabButtons = document.querySelectorAll(".tab-btn");
    var authStatus = document.getElementById("authStatus");

    function setStatus(text, tone) {
      if (!authStatus) return;
      authStatus.textContent = text || "";
      authStatus.classList.remove("success", "error", "warn");
      if (tone) authStatus.classList.add(tone);
    }

    function toggleTab(targetId) {
      var isLogin = targetId === "loginForm";
      loginForm.classList.toggle("hidden", !isLogin);
      signupForm.classList.toggle("hidden", isLogin);
      tabButtons.forEach(function (btn) {
        btn.classList.toggle("active", btn.getAttribute("data-target") === targetId);
      });
      setStatus("");
    }

    tabButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        toggleTab(String(btn.getAttribute("data-target") || "loginForm"));
      });
    });

    loginForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var emailEl = document.getElementById("loginEmail");
      var passwordEl = document.getElementById("loginPassword");
      var email = emailEl ? String(emailEl.value || "").trim() : "";
      var password = passwordEl ? String(passwordEl.value || "").trim() : "";
      if (!email || !password) {
        setStatus("Email and password are required.", "error");
        return;
      }

      setStatus("Logging in...", "warn");
      fetch(apiUrl("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email, password: password })
      })
        .then(function (response) {
          return response.json().catch(function () { return {}; }).then(function (data) {
            if (!response.ok) {
              throw new Error(String((data && data.error) || "Login failed."));
            }
            return data;
          });
        })
        .then(function (data) {
          setAuthSession(data.token, data.user);
          setStatus("Logged in successfully.", "success");
          window.setTimeout(function () {
            window.location.href = "explore.html";
          }, 600);
        })
        .catch(function (error) {
          setStatus(String((error && error.message) || "Login failed."), "error");
        });
    });

    signupForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var nameEl = document.getElementById("signupName");
      var emailEl = document.getElementById("signupEmail");
      var passwordEl = document.getElementById("signupPassword");
      var fullName = nameEl ? String(nameEl.value || "").trim() : "";
      var email = emailEl ? String(emailEl.value || "").trim() : "";
      var password = passwordEl ? String(passwordEl.value || "").trim() : "";
      if (!fullName || !email || !password) {
        setStatus("Name, email, and password are required.", "error");
        return;
      }

      setStatus("Creating account...", "warn");
      fetch(apiUrl("/api/auth/signup"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: fullName, email: email, password: password })
      })
        .then(function (response) {
          return response.json().catch(function () { return {}; }).then(function (data) {
            if (!response.ok) {
              throw new Error(String((data && data.error) || "Signup failed."));
            }
            return data;
          });
        })
        .then(function (data) {
          setAuthSession(data.token, data.user);
          setStatus("Account created and logged in.", "success");
          window.setTimeout(function () {
            window.location.href = "explore.html";
          }, 700);
        })
        .catch(function (error) {
          setStatus(String((error && error.message) || "Signup failed."), "error");
        });
    });
  }

  function initAdminDashboard() {
    var newBody = document.getElementById("newRequestsBody");
    var reviewedBody = document.getElementById("reviewedBody");
    if (!newBody || !reviewedBody) return;
    var newWrap = document.getElementById("newRequestsWrap");
    var reviewedWrap = document.getElementById("reviewedWrap");
    var tabNew = document.getElementById("adminTabNew");
    var tabReviewed = document.getElementById("adminTabReviewed");
    var pendingCount = document.getElementById("pendingCount");
    var approvedCount = document.getElementById("approvedCount");
    var rejectedCount = document.getElementById("rejectedCount");

    function setActiveTab(tab) {
      var showNew = tab !== "reviewed";
      if (newWrap) newWrap.classList.toggle("hidden", !showNew);
      if (reviewedWrap) reviewedWrap.classList.toggle("hidden", showNew);
      if (tabNew) tabNew.classList.toggle("active", showNew);
      if (tabReviewed) tabReviewed.classList.toggle("active", !showNew);
    }

    if (tabNew) tabNew.addEventListener("click", function () { setActiveTab("new"); });
    if (tabReviewed) tabReviewed.addEventListener("click", function () { setActiveTab("reviewed"); });
    setActiveTab("new");

    var user = getAuthUser();
    if (!user || String(user.role || "").toLowerCase() !== "admin") {
      newBody.innerHTML = '<tr><td colspan="7">Login as admin to review submitted itineraries.</td></tr>';
      reviewedBody.innerHTML = '<tr><td colspan="7">Login as admin to review submitted itineraries.</td></tr>';
      return;
    }

    function renderRows(items, targetBody, includeActions) {
      if (!targetBody) return;
      if (!items || !items.length) {
        targetBody.innerHTML = '<tr><td colspan="7">No itineraries in this section.</td></tr>';
        return;
      }
      targetBody.innerHTML = "";
      items.forEach(function (item) {
        var tr = document.createElement("tr");
        var statusLabel = String(item.reviewStatus || "pending");
        var verification = item && item.proof ? item.proof.verification : null;
        var proofLabel = "FAIL (route point missing)";
        if (verification && verification.available) {
          var distance = Number(verification.distanceKm);
          var prettyDistance = Number.isFinite(distance) ? distance.toFixed(2) + " km" : "-";
          var routePoint = String(verification.matchedRoutePoint || "").trim();
          proofLabel = (verification.within5km ? "PASS" : "FAIL") + " (" + prettyDistance + ")";
          if (routePoint) {
            proofLabel += " near " + routePoint;
          }
        }
        var actionsCell = includeActions
          ? '<button class="btn-small approve" data-id="' + String(item.id || "") + '" data-status="approved">Approve</button><button class="btn-small reject" data-id="' + String(item.id || "") + '" data-status="rejected">Reject</button>'
          : '<span class="status-line">Reviewed</span>';
        tr.innerHTML = [
          "<td>" + String(item.title || "Traveler") + "</td>",
          "<td>" + String(item.route || "-") + "</td>",
          "<td>" + String(item.duration || "-") + "</td>",
          "<td>" + String(item.budget || "-") + "</td>",
          "<td>" + proofLabel + "</td>",
          "<td>" + statusLabel + "</td>",
          "<td>" + actionsCell + "</td>"
        ].join("");
        targetBody.appendChild(tr);
      });
    }

    function loadSubmissions() {
      fetch(apiUrl("/api/itineraries?limit=200"), { headers: buildAuthHeaders() })
        .then(function (response) {
          return response.json().catch(function () { return {}; }).then(function (data) {
            if (!response.ok) {
              throw new Error(String((data && data.error) || "Failed to load itineraries."));
            }
            return data;
          });
        })
        .then(function (data) {
          var items = (data && data.items) || [];
          var pendingItems = items.filter(function (item) {
            return String((item && item.reviewStatus) || "").toLowerCase() === "pending";
          });
          var reviewedItems = items.filter(function (item) {
            var status = String((item && item.reviewStatus) || "").toLowerCase();
            return status === "approved" || status === "rejected";
          });

          renderRows(pendingItems, newBody, true);
          renderRows(reviewedItems, reviewedBody, false);

          if (pendingCount) pendingCount.textContent = String(pendingItems.length);
          if (approvedCount) {
            approvedCount.textContent = String(reviewedItems.filter(function (item) {
              return String((item && item.reviewStatus) || "").toLowerCase() === "approved";
            }).length);
          }
          if (rejectedCount) {
            rejectedCount.textContent = String(reviewedItems.filter(function (item) {
              return String((item && item.reviewStatus) || "").toLowerCase() === "rejected";
            }).length);
          }
        })
        .catch(function (error) {
          var text = String((error && error.message) || "Failed to load data.");
          newBody.innerHTML = '<tr><td colspan="7">' + text + "</td></tr>";
          reviewedBody.innerHTML = '<tr><td colspan="7">' + text + "</td></tr>";
        });
    }

    newBody.addEventListener("click", function (event) {
      var btn = event.target.closest("button[data-id]");
      if (!btn) return;
      var itineraryId = String(btn.getAttribute("data-id") || "").trim();
      var nextStatus = String(btn.getAttribute("data-status") || "").trim();
      if (!itineraryId || !nextStatus) return;

      fetch(apiUrl("/api/itineraries/" + encodeURIComponent(itineraryId) + "/status"), {
        method: "PATCH",
        headers: buildAuthHeaders(),
        body: JSON.stringify({ reviewStatus: nextStatus })
      })
        .then(function (response) {
          return response.json().catch(function () { return {}; }).then(function (data) {
            if (!response.ok) {
              throw new Error(String((data && data.error) || "Status update failed."));
            }
            return data;
          });
        })
        .then(function () {
          loadSubmissions();
        })
        .catch(function () {});
    });

    loadSubmissions();
  }

  function initTripTalesChatbot() {
    if (document.getElementById("tt-ai-widget")) return;

    var style = document.createElement("style");
    style.textContent = [
      ".tt-ai-widget{position:fixed;right:16px;bottom:16px;z-index:1200;font-family:'Segoe UI',sans-serif;}",
      ".tt-ai-toggle{width:56px;height:56px;border:0;border-radius:999px;background:linear-gradient(135deg,#0d7ee5,#14b8a6);color:#fff;font-size:23px;cursor:pointer;box-shadow:0 14px 30px rgba(4,18,36,.26);}",
      ".tt-ai-prompt{position:absolute;right:68px;bottom:8px;width:min(290px,78vw);border:1px solid #dbe5f1;border-radius:14px;background:#fff;padding:10px 12px;box-shadow:0 14px 28px rgba(4,18,36,.18);}",
      ".tt-ai-prompt p{margin:0 0 8px;color:#0f172a;font-size:.9rem;font-weight:600;}",
      ".tt-ai-prompt-actions{display:flex;gap:8px;}",
      ".tt-ai-btn{border:1px solid #cbd5e1;border-radius:9px;background:#fff;padding:6px 10px;font-size:.82rem;font-weight:700;cursor:pointer;color:#1e293b;}",
      ".tt-ai-btn.primary{background:#0d7ee5;border-color:#0d7ee5;color:#fff;}",
      ".tt-ai-panel{display:none;position:absolute;right:0;bottom:70px;width:min(360px,92vw);border:1px solid #dbe5f1;border-radius:16px;background:#fff;overflow:hidden;box-shadow:0 22px 48px rgba(4,18,36,.22);}",
      ".tt-ai-panel.open{display:block;}",
      ".tt-ai-head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:linear-gradient(135deg,#0a4f94,#0e7490);color:#fff;}",
      ".tt-ai-head h3{margin:0;font-size:.95rem;font-weight:700;}",
      ".tt-ai-close{border:0;background:transparent;color:#fff;font-size:22px;line-height:1;cursor:pointer;}",
      ".tt-ai-messages{height:320px;overflow-y:auto;padding:12px;background:#f8fbff;}",
      ".tt-ai-msg{margin-bottom:10px;padding:9px 11px;border-radius:10px;font-size:.9rem;line-height:1.4;word-break:break-word;}",
      ".tt-ai-msg.user{margin-left:auto;max-width:88%;background:#0d7ee5;color:#fff;}",
      ".tt-ai-msg.bot{max-width:92%;background:#e5eefb;color:#0f2b4a;}",
      ".tt-ai-msg.typing{font-style:italic;color:#334155;}",
      ".tt-ai-input{display:flex;gap:8px;padding:10px;border-top:1px solid #dbe5f1;background:#fff;}",
      ".tt-ai-input input{flex:1;border:1px solid #cbd5e1;border-radius:10px;padding:9px 10px;font-size:.9rem;outline:none;}",
      ".tt-ai-input input:focus{border-color:#0d7ee5;box-shadow:0 0 0 3px rgba(13,126,229,.14);}",
      ".tt-ai-send{border:0;border-radius:10px;padding:0 14px;background:#0d7ee5;color:#fff;font-weight:700;cursor:pointer;}",
      ".tt-ai-send:disabled{opacity:.6;cursor:not-allowed;}"
    ].join("");
    document.head.appendChild(style);

    var widget = document.createElement("section");
    widget.id = "tt-ai-widget";
    widget.className = "tt-ai-widget";
    widget.innerHTML = [
      '<div id="ttAiPrompt" class="tt-ai-prompt">',
      "  <p>Do you need help?</p>",
      '  <div class="tt-ai-prompt-actions">',
      '    <button id="ttAiNeedHelp" class="tt-ai-btn primary" type="button">Yes, help me</button>',
      '    <button id="ttAiDismiss" class="tt-ai-btn" type="button">Not now</button>',
      "  </div>",
      "</div>",
      '<div id="ttAiPanel" class="tt-ai-panel" aria-hidden="true">',
      '  <div class="tt-ai-head"><h3>TripTales Assistant</h3><button id="ttAiClose" class="tt-ai-close" type="button" aria-label="Close assistant">&times;</button></div>',
      '  <div id="ttAiMessages" class="tt-ai-messages"></div>',
      '  <div class="tt-ai-input"><input id="ttAiInput" type="text" placeholder="Ask about Jammu & Kashmir itineraries..." /><button id="ttAiSend" class="tt-ai-send" type="button">Send</button></div>',
      "</div>",
      '<button id="ttAiToggle" class="tt-ai-toggle" type="button" aria-label="Open assistant" aria-expanded="false">💬</button>'
    ].join("");
    document.body.appendChild(widget);

    var prompt = document.getElementById("ttAiPrompt");
    var panel = document.getElementById("ttAiPanel");
    var toggle = document.getElementById("ttAiToggle");
    var closeBtn = document.getElementById("ttAiClose");
    var helpBtn = document.getElementById("ttAiNeedHelp");
    var dismissBtn = document.getElementById("ttAiDismiss");
    var messages = document.getElementById("ttAiMessages");
    var input = document.getElementById("ttAiInput");
    var sendBtn = document.getElementById("ttAiSend");

    if (!prompt || !panel || !toggle || !helpBtn || !dismissBtn || !messages || !input || !sendBtn) return;

    var storageKey = "ttAiChatHistoryV1";
    var history = [];
    var typingEl = null;
    var busy = false;

    function saveHistory() {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(history));
      } catch (e) {}
    }

    function loadHistory() {
      try {
        var raw = sessionStorage.getItem(storageKey);
        if (!raw) return [];
        var parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
          .filter(function (item) {
            return item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string";
          })
          .slice(-12);
      } catch (e) {
        return [];
      }
    }

    function addMessage(text, role, save) {
      var messageEl = document.createElement("div");
      messageEl.className = "tt-ai-msg " + role;
      messageEl.textContent = text;
      messages.appendChild(messageEl);
      messages.scrollTop = messages.scrollHeight;
      if (save) {
        history.push({ role: role === "user" ? "user" : "assistant", content: text });
        if (history.length > 12) history = history.slice(-12);
        saveHistory();
      }
      return messageEl;
    }

    function setPanelState(open) {
      panel.classList.toggle("open", open);
      panel.setAttribute("aria-hidden", open ? "false" : "true");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) {
        prompt.style.display = "none";
        input.focus();
      }
    }

    function setBusy(state) {
      busy = state;
      sendBtn.disabled = state;
      input.disabled = state;
      if (state) {
        typingEl = addMessage("Typing...", "bot typing", false);
      } else if (typingEl && typingEl.parentNode) {
        typingEl.parentNode.removeChild(typingEl);
        typingEl = null;
      }
    }

    async function askAssistant(question) {
      var response = await fetch(apiUrl("/api/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: question,
          history: history
        })
      });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok) {
        var detail = data && data.error ? data.error : "Unable to get a reply right now.";
        throw new Error(detail);
      }
      return String(data.reply || "I could not generate a response. Please try again.");
    }

    function wait(ms) {
      return new Promise(function (resolve) {
        setTimeout(resolve, ms);
      });
    }

    function submitMessage() {
      var text = String(input.value || "").trim();
      if (!text || busy) return;
      input.value = "";
      addMessage(text, "user", true);
      setBusy(true);
      askAssistant(text)
        .then(function (reply) {
          return wait(1000).then(function () {
          addMessage(reply, "bot", true);
          });
        })
        .catch(function (error) {
          return wait(1000).then(function () {
          addMessage(error.message || "Something went wrong. Please try again.", "bot", false);
          });
        })
        .finally(function () {
          setBusy(false);
        });
    }

    helpBtn.addEventListener("click", function () {
      setPanelState(true);
      if (!messages.children.length) {
        addMessage("Hi. I can help with Jammu and Kashmir trips, budgets, routes, and itinerary planning. What do you need?", "bot", false);
      }
    });
    dismissBtn.addEventListener("click", function () {
      prompt.style.display = "none";
    });
    toggle.addEventListener("click", function () {
      setPanelState(!panel.classList.contains("open"));
    });
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        setPanelState(false);
      });
    }
    sendBtn.addEventListener("click", submitMessage);
    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter") submitMessage();
    });

    history = loadHistory();
    history.forEach(function (item) {
      addMessage(item.content, item.role === "user" ? "user" : "bot", false);
    });
    if (history.length) {
      prompt.style.display = "none";
    }
  }

  initNavigationAuthState();
  initHomeSearchBar();
  initExploreSearchFiltering();
  initExploreEnhancements();
  initApprovedExploreCards();
  initExploreBackendSummary();
  initCreateItineraryProof();
  initAuthForms();
  initAdminDashboard();
  initMiniForms();
  initTripTalesChatbot();
})();
