/* Siddhivinayak Temple Guesthouse — admin panel */
(function () {
  "use strict";

  /* ------------------------------------------------------------- state */
  var S = { data: null, bookings: [], enquiries: [], tab: "dashboard", dirty: false, saving: false, health: null, userTouched: false };

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (v) {
    return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  };
  var uid = function (p) { return p + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); };
  var money = function (n, cur) { return (cur || "₹") + (Number(n || 0)).toLocaleString("en-IN"); };
  var fmtDate = function (v) {
    if (!v) return "";
    var d = new Date(v);
    return isNaN(d) ? String(v) : d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };
  var nice = function (v) {
    if (!v) return "";
    var d = new Date(v);
    return isNaN(d) ? String(v) : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  };

  /* --------------------------------------------------------------- api */
  function api(path, opts) {
    opts = opts || {};
    return fetch("/api/" + path, {
      method: opts.method || "GET",
      headers: opts.body ? { "Content-Type": "application/json" } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      return r.json().then(function (j) {
        if (r.status === 401) { showLogin(); throw new Error("Session expired"); }
        if (!r.ok) throw new Error(j.error || "Request failed");
        return j;
      });
    }).catch(function (err) {
      if (err instanceof TypeError) {
        serverStopped();
        throw new Error("The server is not responding.");
      }
      throw err;
    });
  }

  /** Shown when the Node server is not running or was stopped. */
  function serverStopped() {
    if (window.VGH_OFFLINE) return;
    if (document.getElementById("serverDown")) return;
    var box = document.createElement("div");
    box.id = "serverDown";
    box.style.cssText =
      "position:fixed;inset:0;z-index:999;background:rgba(8,7,5,.92);display:grid;place-items:center;padding:24px;font-family:'DM Sans',Arial,sans-serif";
    box.innerHTML =
      '<div style="background:#fff;border-radius:10px;padding:28px;max-width:460px;border-top:4px solid #c89a3c">' +
      "<h3 style=\"font-family:Georgia,serif;font-size:20px;margin:0 0 8px\">The server has stopped</h3>" +
      '<p style="font-size:13px;color:#6b6559;line-height:1.7;margin:0 0 14px">Your content is saved safely on disk. ' +
      "Restart the server to carry on editing.</p>" +
      '<code style="display:block;background:#f4f1ea;border:1px solid #e3ddd0;border-radius:6px;padding:12px;font-size:13px">cd "' +
      "Varanasi_Guest_House_Final 2" + '"<br>node server.js</code>' +
      '<p style="font-size:12px;color:#8a8378;margin:14px 0 0">Or just double-click <b>START.command</b> in the project folder.</p>' +
      "</div>";
    document.body.appendChild(box);
  }

  window.addEventListener("offline", serverStopped);

  function toast(msg, kind) {
    var box = $("#adminToast");
    var el = document.createElement("div");
    el.textContent = msg;
    el.style.cssText = "background:" + (kind === "err" ? "#8c2b23" : kind === "warn" ? "#9a6a12" : "#1f5c39") +
      ";color:#fff;padding:10px 15px;border-radius:6px;font-size:12px;box-shadow:0 8px 24px rgba(0,0,0,.25);max-width:340px";
    box.appendChild(el);
    setTimeout(function () {
      el.style.transition = "opacity .4s";
      el.style.opacity = "0";
      setTimeout(function () { el.remove(); }, 400);
    }, 3200);
  }

  /* --------------------------------------------------------- data path */
  function getPath(obj, path) {
    return path.split(".").reduce(function (o, k) { return o == null ? o : o[k]; }, obj);
  }
  function setPath(obj, path, value) {
    var keys = path.split(".");
    var last = keys.pop();
    var t = keys.reduce(function (o, k) { return o[k] = o[k] || {}; }, obj);
    t[last] = value;
  }
  function markDirty(on) {
    S.dirty = on === undefined ? true : on;
    $("#dirtyDot").classList.toggle("hidden", !S.dirty);
    $("#saveLabel").textContent = S.dirty ? "Unsaved changes" : "All changes saved";
    $("#btnSave").classList.toggle("btn-gold", S.dirty);
  }

  /* -------------------------------------------------------- form atoms */
  function field(label, path, opts) {
    opts = opts || {};
    var v = getPath(S.data, path);
    if (v == null) v = opts.def != null ? opts.def : "";
    var id = "f_" + path.replace(/\./g, "_");
    var control;
    if (opts.type === "textarea") {
      control = '<textarea id="' + id + '" data-path="' + path + '" placeholder="' + esc(opts.ph || "") + '"' +
        (opts.rows ? ' rows="' + opts.rows + '"' : "") + ">" + esc(v) + "</textarea>";
    } else if (opts.type === "select") {
      control = '<select id="' + id + '" data-path="' + path + '">' +
        (opts.options || []).map(function (o) {
          var val = typeof o === "string" ? o : o.value;
          var lab = typeof o === "string" ? o : o.label;
          return '<option value="' + esc(val) + '"' + (String(v) === String(val) ? " selected" : "") + ">" + esc(lab) + "</option>";
        }).join("") + "</select>";
    } else if (opts.type === "checkbox") {
      return '<label class="check"><input type="checkbox" id="' + id + '" data-path="' + path + '"' + (v ? " checked" : "") + "><span>" + esc(label) + "</span></label>";
    } else if (opts.type === "number") {
      control = '<input type="number" id="' + id + '" data-path="' + path + '" value="' + esc(v) + '"' +
        (opts.step ? ' step="' + opts.step + '"' : "") + (opts.min != null ? ' min="' + opts.min + '"' : "") + ">";
    } else {
      control = '<input type="text" id="' + id + '" data-path="' + path + '" value="' + esc(v) + '" placeholder="' + esc(opts.ph || "") + '">';
    }
    return '<label class="f"><span>' + esc(label) + (opts.hint ? ' <em>— ' + esc(opts.hint) + "</em>" : "") + "</span>" + control +
      (opts.help ? '<div class="help">' + opts.help + "</div>" : "") + "</label>";
  }

  /** Image / video picker bound to a data path. Returns HTML block. */
  function mediaField(label, path, kind) {
    kind = kind || "image";
    var v = getPath(S.data, path) || "";
    var id = "m_" + path.replace(/\./g, "_");
    var preview = kind === "video"
      ? (v ? '<video class="imgprev" src="' + esc(v) + '" muted></video>' : '<div class="imgprev video">No video</div>')
      : (v ? '<img class="imgprev" id="' + id + '_prev" src="' + esc(v) + '" onclick="previewImage(this.src)">' : '<div class="imgprev" id="' + id + '_prev">No image</div>');
    var accept = kind === "video" ? "video/*" : "image/*";
    return (
      '<div class="f" style="margin-bottom:14px"><span style="display:block;font-size:11px;font-weight:600;color:#5b564c;margin-bottom:6px">' + esc(label) + "</span>" +
      '<div class="imgfield">' + preview +
      '<div class="imgbtns">' +
      '<input type="text" data-path="' + path + '" value="' + esc(v) + '" placeholder="' + (kind === "video" ? "Paste a video URL or upload a file" : "Paste an image URL or upload a file") + '">' +
      '<div class="row tight">' +
      '<label class="btn btn-sm" style="display:inline-block">Upload ' + (kind === "video" ? "video" : "image") +
      '<input type="file" accept="' + accept + '" data-upload="' + path + '" style="display:none"></label>' +
      '<button class="btn btn-sm" data-pick="' + path + '" data-kind="' + kind + '">Choose from library</button>' +
      (v ? '<button class="btn btn-sm btn-red" data-clearimg="' + path + '">Remove</button>' : "") +
      "</div>" +
      (kind === "video" ? '<div class="help">MP4 or WebM. Keep clips under 20 MB for fast loading.</div>' : "") +
      "</div></div></div>"
    );
  }

  window.previewImage = function (src) { $("#lightboxImg").src = src; $("#lightbox").style.display = "flex"; };

  /* ------------------------------------------------------------- boot */
  function showLogin() {
    $("#loginScreen").classList.remove("hidden");
    $("#appShell").classList.add("hidden");
  }

  $("#loginForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var err = $("#loginError");
    err.classList.add("hidden");
    api("session", { method: "POST", body: { username: $("#loginUser").value, password: $("#loginPass").value } })
      .then(function (r) { S.username = r.username || $("#loginUser").value; $("#loginPass").value = ""; start(); })
      .catch(function (m) { err.textContent = m.message; err.classList.remove("hidden"); });
  });

  $("#btnLogout").addEventListener("click", function () {
    if (S.dirty && !confirm("You have unsaved changes. Sign out anyway?")) return;
    api("session", { method: "DELETE" }).then(showLogin);
  });

  $("#btnRefresh").addEventListener("click", function () {
    if (S.dirty && !confirm("Discard unsaved changes and reload?")) return;
    loadAll();
  });

  $("#btnSave").addEventListener("click", function () { saveContent(); });

  window.addEventListener("beforeunload", function (e) {
    // only warn after a real edit by a person, never for programmatic changes
    if (S.dirty && S.userTouched) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  ["pointerdown", "keydown"].forEach(function (evt) {
    window.addEventListener(evt, function () { S.userTouched = true; }, { capture: true });
  });

  function start() {
    $("#loginScreen").classList.add("hidden");
    $("#appShell").classList.remove("hidden");
    loadAll();
  }

  function loadAll() {
    return Promise.all([
      api("content"),
      api("bookings"),
      api("enquiries"),
      api("health").catch(function () { return null; })
    ]).then(function (r) {
      S.data = r[0];
      S.bookings = r[1].items;
      S.enquiries = r[2].items;
      S.health = r[3];
      markDirty(false);
      updateNavCounts();
      render();
    }).catch(function (e) { toast(e.message, "err"); });
  }

  function storageChip() {
    if (!S.health) return "";
    var live = S.health.storage === "supabase";
    return '<span class="store-chip ' + (live ? "live" : "local") + '">' +
      (live ? "● Supabase connected" : "● Local storage") +
      (S.health.project ? ' <em>' + esc(S.health.project) + "</em>" : "") +
      "</span>";
  }

  function updateNavCounts() {
    $("#navCountRooms").textContent = (S.data.rooms || []).length;
    $("#navCountGallery").textContent = (S.data.gallery || []).length;
    $("#navCountOffers").textContent = (S.data.offers || []).length;
    $("#navCountPlans").textContent = (S.data.travelPlans || []).length;
    $("#navCountTesti").textContent = (S.data.testimonials || []).length;
    var nb = S.bookings.filter(function (b) { return b.status === "new"; }).length;
    var ne = S.enquiries.filter(function (e) { return e.status === "new"; }).length;
    $("#navCountBookings").textContent = nb || "";
    $("#navCountEnquiries").textContent = ne || "";
  }

  function saveContent() {
    if (S.saving) return;
    S.saving = true;
    $("#btnSave").disabled = true;
    $("#saveLabel").textContent = "Saving…";
    api("content", { method: "PUT", body: S.data })
      .then(function () {
        markDirty(false);
        toast("Changes published to the website");
      })
      .catch(function (e) {
        $("#saveLabel").textContent = "Save failed";
        toast(e.message, "err");
      })
      .then(function () {
        S.saving = false;
        $("#btnSave").disabled = false;
      });
  }

  /* ------------------------------------------------------------ router */
  var TABS = {
    dashboard: { title: "Dashboard", sub: "Overview of your property", render: viewDashboard },
    rooms: { title: "Rooms & Rates", sub: "Add rooms, prices, amenities and photos", render: viewRooms },
    gallery: { title: "Gallery", sub: "Manage the photos shown on the website", render: viewGallery },
    offers: { title: "Seasonal Offers", sub: "Featured card, festival packages and long-stay deals", render: viewOffers },
    plans: { title: "Custom Travel Plans", sub: "Per-person pricing, duration and inclusions", render: viewPlans },
    testimonials: { title: "Guest Testimonials", sub: "Short video clips and guest quotes", render: viewTestimonials },
    pages: { title: "Page Sections", sub: "Hero, trust bar, about, attractions, reviews, footer", render: viewPages },
    bookings: { title: "Online Bookings", sub: "Every booking request from the website", render: viewBookings },
    enquiries: { title: "Enquiries", sub: "Offer and custom travel plan requests", render: viewEnquiries },
    media: { title: "Media Library", sub: "All uploaded photos and videos", render: viewMedia },
    settings: { title: "Settings", sub: "Contact details, map, admin access and backup", render: viewSettings }
  };

  $$(".side a.nav-item").forEach(function (a) {
    a.addEventListener("click", function () {
      if (S.dirty && !confirm("You have unsaved changes. Leave this tab and discard them?")) return;
      markDirty(false);
      location.hash = a.dataset.tab;
    });
  });

  window.addEventListener("hashchange", function () {
    S.tab = location.hash.replace("#", "") || "dashboard";
    render();
  });

  function render() {
    var tab = TABS[S.tab] ? S.tab : "dashboard";
    $$(".side a.nav-item").forEach(function (a) { a.classList.toggle("on", a.dataset.tab === tab); });
    $("#tabTitle").textContent = TABS[tab].title;
    $("#tabSub").textContent = TABS[tab].sub;
    $("#tabBody").innerHTML = TABS[tab].render();
    $("#tabBody").scrollIntoView({ block: "start" });
    bindLive();
    updateNavCounts();
    var chip = $("#storageChip");
    if (chip) chip.innerHTML = storageChip();
    if (tab === "media") loadMedia();
  }

  /* --------------------------------------------------- generic bindings */
  function bindLive(root) {
    // bound fields (skip file inputs, checkboxes and multi-selects — they have their own handlers)
    $$("[data-path]", root).forEach(function (el) {
      if (el.type === "file" || el.type === "checkbox" || el.multiple) return;
      var write = function () {
        var v;
        if (el.hasAttribute("data-bool")) v = el.value === "true";
        else if (el.type === "number") v = el.value === "" ? null : Number(el.value);
        else v = el.value;
        setPath(S.data, el.dataset.path, v);
        markDirty();
      };
      el.addEventListener("input", write);
      el.addEventListener("change", write);
    });
    $$("input[type=checkbox][data-path]").forEach(function (el) {
      el.addEventListener("change", function () {
        setPath(S.data, el.dataset.path, el.checked);
        markDirty();
      });
    });

    // text-path fields (media url inputs) update the matching preview
    $$("[data-path]", root).forEach(function (el) {
      if (el.type === "checkbox" || el.tagName === "TEXTAREA") return;
      el.addEventListener("input", function () {
        var prev = document.getElementById("m_" + el.dataset.path.replace(/\./g, "_") + "_prev");
        if (prev && prev.tagName === "IMG") prev.src = el.value;
      });
    });

    // uploads
    $$("[data-upload]").forEach(function (input) {
      input.addEventListener("change", function () {
        if (!input.files || !input.files[0]) return;
        var path = input.dataset.upload;
        var kind = input.dataset.kind || (/video/.test(input.accept) ? "video" : "image");
        readFile(input.files[0], function (dataUrl) {
          setPath(S.data, path, { dataUrl: dataUrl, name: input.files[0].name });
          markDirty();
          input.value = "";
          toast("Uploaded — click Save changes to publish", "warn");
          // re-render just this block
          var holder = input.closest(".imgfield");
          var wrapper = holder.parentNode;
          var labelHtml = wrapper.innerHTML;
          var idx = labelHtml.indexOf('<div class="imgfield"');
          var rebuilt = '<div class="f" style="margin-bottom:14px">' + labelHtml.slice(idx);
          wrapper.outerHTML = rebuilt;
          bindLive();
        });
      });
    });

    // clear media
    $$("[data-clearimg]").forEach(function (b) {
      b.addEventListener("click", function () {
        var path = b.dataset.clearimg;
        setPath(S.data, path, "");
        markDirty();
        render();
      });
    });

    // open media picker
    $$("[data-pick]").forEach(function (b) {
      b.addEventListener("click", function () {
        openMediaPicker(b.dataset.pick, b.dataset.kind || "image");
      });
    });
  }

  /** "Label #anchor" per line -> [{label, href}] */
  function parseLinkLines(text) {
    return text.split("\n").map(function (line) { return line.trim(); }).filter(Boolean).map(function (line) {
      var m = /^(\S.*?)\s+(#\S*)$/.exec(line);
      if (m) return { label: m[1], href: m[2] };
      var w = line.split(/\s+/);
      if (w.length > 1 && w[0].indexOf("#") === 0) return { label: w.slice(1).join(" "), href: w[0] };
      return { label: line, href: "#" };
    });
  }

  function readFile(file, cb) {
    var fr = new FileReader();
    fr.onload = function () { cb(fr.result); };
    fr.readAsDataURL(file);
  }

  /* -------------------------------------------------------- media picker */
  var pickerTarget = null;
  function openMediaPicker(path, kind) {
    pickerTarget = { path: path, kind: kind };
    var back = $(".modal-back");
    if (back) back.remove();
    back = document.createElement("div");
    back.className = "modal-back";
    back.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:150;display:flex;align-items:center;justify-content:center;padding:24px";
    back.innerHTML =
      '<div class="card" style="width:min(820px,100%);max-height:86vh;overflow:auto;margin:0"><div class="card-head"><h3>Choose ' + kind + "</h3><span class='hint'>Click a file to use it</span>" +
      '<div class="spacer"></div><button class="btn btn-sm" data-close>Close</button></div>' +
      '<div class="card-body"><div class="media-grid" id="pickerGrid"><div class="empty">Loading…</div></div></div></div>';
    document.body.appendChild(back);
    back.querySelector("[data-close]").addEventListener("click", function () { back.remove(); });
    back.addEventListener("click", function (e) { if (e.target === back) back.remove(); });

    api("media").then(function (r) {
      var items = r.items.filter(function (i) { return pickerTarget.kind === "video" ? (i.type||"").indexOf("video") === 0 : (i.type||"").indexOf("image") === 0; });
      if (!items.length) {
        back.querySelector("#pickerGrid").innerHTML = '<div class="empty">No files yet. Upload photos from the Media Library tab.</div>';
        return;
      }
      back.querySelector("#pickerGrid").innerHTML = items.map(function (i) {
        return '<div class="mcell" data-url="' + esc(i.url) + '" style="cursor:pointer">' +
          ((i.type||"").indexOf("image") === 0
            ? '<img src="' + esc(i.url) + '" loading="lazy">'
            : '<video src="' + esc(i.url) + '" style="width:100%;height:100px;object-fit:cover"></video>') +
          '<div class="bar"><span>' + esc(i.name.slice(0, 14)) + "</span></div></div>";
      }).join("");
      $$("#pickerGrid .mcell").forEach(function (cell) {
        cell.addEventListener("click", function () {
          setPath(S.data, pickerTarget.path, cell.dataset.url);
          markDirty();
          back.remove();
          render();
        });
      });
    });
  }

  /* =================================================== TAB: DASHBOARD */
  function viewDashboard() {
    var d = S.data, site = d.site || {};
    var newB = S.bookings.filter(function (b) { return b.status === "new"; }).length;
    var newE = S.enquiries.filter(function (e) { return e.status === "new"; }).length;
    var max = Math.max.apply(null, [1].concat(S.bookings.map(function (b) { return Number(b.amount) || 0; })));
    var pipeline = S.bookings.filter(function (b) { return b.status !== "cancelled"; })
      .reduce(function (s, b) { return s + (Number(b.amount) || 0); }, 0);

    var stats = [
      { n: S.bookings.length, l: "Total bookings", c: newB ? newB + " new" : "all handled", k: "new" },
      { n: S.enquiries.length, l: "Enquiries", c: newE ? newE + " new" : "all handled", k: newE ? "new" : "none" },
      { n: money(pipeline, site.currency), l: "Booking value (est.)", c: "max " + money(max, site.currency), k: "none" },
      { n: (d.rooms || []).length, l: "Rooms listed", c: (d.rooms || []).filter(function (r) { return r.active !== false; }).length + " live", k: "none" },
      { n: (d.offers || []).filter(function (o) { return o.active !== false; }).length, l: "Live offers", c: "seasonal", k: "none" },
      { n: (d.travelPlans || []).length, l: "Travel plans", c: "custom itineraries", k: "none" },
      { n: (d.gallery || []).length, l: "Gallery photos", c: "uploaded", k: "none" },
      { n: (d.testimonials || []).length, l: "Testimonials", c: "video clips", k: "none" }
    ].map(function (s) {
      return '<div class="stat"><b>' + esc(s.n) + "</b><span>" + esc(s.l) + "</span><br><span class='delta " + s.k + "'>" + esc(s.c) + "</span></div>";
    }).join("");

    var recent = S.bookings.slice(0, 6).concat(S.enquiries.slice(0, 4)).sort(function (a, b) {
      return String(b.createdAt).localeCompare(String(a.createdAt));
    }).slice(0, 8);

    var timeline = recent.length ? recent.map(function (r) {
      return '<div class="tl-item"><div class="t">' + esc(fmtDate(r.createdAt)) + " · " + esc(r.kind) + "</div>" +
        "<div><b>" + esc(r.name || "Guest") + "</b> — " + esc(r.subject || r.plan || r.room || r.message || "") + "</div></div>";
    }).join("") : '<div class="empty">No activity yet. Bookings and enquiries will appear here.</div>';

    return (
      '<div class="stat-grid">' + stats + "</div>" +
      '<div class="grid g2">' +
      '<div class="card"><div class="card-head"><h3>Quick actions</h3></div><div class="card-body"><div class="row">' +
      '<button class="btn btn-gold btn-sm" data-go="rooms">+ Add a room</button>' +
      '<button class="btn btn-sm" data-go="gallery">+ Upload photos</button>' +
      '<button class="btn btn-sm" data-go="offers">+ Seasonal offer</button>' +
      '<button class="btn btn-sm" data-go="plans">+ Travel plan</button>' +
      '<button class="btn btn-sm" data-go="testimonials">+ Testimonial</button>' +
      '<button class="btn btn-sm" data-go="media">Media library</button>' +
      '<button class="btn btn-sm btn-blue" data-go="bookings">View bookings</button>' +
      '<button class="btn btn-sm" data-go="settings">Contact &amp; map</button>' +
      "</div>" +
      '<div class="alert info" style="margin:16px 0 0;margin-bottom:0">Nothing is live until you press <b>Save changes</b>. Your content, photos and bookings are all stored securely in the cloud.</div>' +
      "</div></div>" +
      '<div class="card"><div class="card-head"><h3>Recent activity</h3></div><div class="card-body"><div class="timeline">' + timeline + "</div></div></div>" +
      "</div>" +
      '<div class="grid g2">' +
      '<div class="card"><div class="card-head"><h3>Launch checklist</h3><span class="hint">5 quick wins</span></div><div class="card-body">' +
      check(!/9{9,}/.test((site.whatsapp || "").replace(/\D/g, "")), "Replace the demo WhatsApp number", "Settings → Contact") +
      check(!!site.mapEmbed, "Paste your Google Maps embed", "Settings → Location") +
      check(!/unsplash|demo|placeholder|replace/i.test(JSON.stringify(d.rooms)), "Replace demo room photos", "Rooms") +
      check(!/replace|placeholder/i.test(JSON.stringify(d.testimonials)), "Add real guest clips", "Testimonials") +
      check(!/placeholder/i.test((d.offersSection || {}).note || ""), "Confirm real offer terms", "Offers") +
      "</div></div>" +
      '<div class="card"><div class="card-head"><h3>Booking pipeline</h3></div><div class="card-body">' +
      pipelineBars() +
      "</div></div>" +
      "</div>"
    );
  }

  function check(done, label, where) {
    return '<div class="row" style="padding:6px 0"><span style="color:' + (done ? "#2f7d4f" : "#c89a3c") + ';font-weight:700">' + (done ? "✓" : "○") + "</span>" +
      '<span style="flex:1">' + esc(label) + '</span><span class="help" style="margin:0">' + esc(where) + "</span></div>";
  }

  function pipelineBars() {
    var stages = ["new", "pending", "confirmed", "cancelled", "done"];
    var total = Math.max(1, S.bookings.length);
    return stages.map(function (s) {
      var n = S.bookings.filter(function (b) { return (b.status || "new") === s; }).length;
      var pct = Math.round((n / total) * 100);
      return '<div style="margin-bottom:12px"><div class="row" style="justify-content:space-between;font-size:11.5px;margin-bottom:4px">' +
        '<span class="pill ' + s + '">' + esc(s) + "</span><b>" + n + "</b></div>" +
        '<div style="height:7px;background:#efece5;border-radius:6px;overflow:hidden"><div style="height:100%;width:' + pct + "%;background:#c89a3c\"></div></div></div>";
    }).join("");
  }

  /* ====================================================== TAB: ROOMS */
  function viewRooms() {
    var rooms = S.data.rooms || [];
    return (
      '<div class="card"><div class="card-head"><h3>Rooms</h3>' +
      '<span class="hint">' + rooms.length + " total · drag to reorder, toggle <b>Live</b> to hide from the website</span>" +
      '<div class="spacer"></div>' +
      '<button class="btn btn-gold btn-sm" id="addRoom">+ Add room</button>' +
      '<button class="btn btn-sm" id="addAmenity">+ Add amenity option</button></div>' +
      '<div class="card-body" id="roomsList">' +
      (rooms.length ? rooms.map(roomItem).join("") : '<div class="empty">No rooms yet. Click “Add room”.</div>') +
      "</div></div>" +
      '<div class="card"><div class="card-head"><h3>Amenities &amp; facilities</h3><span class="hint">Available in every room</span></div>' +
      '<div class="card-body">' +
      '<div class="row" id="amenityList">' +
      (S.data.roomAmenities || []).map(function (a, i) {
        return '<span class="chip" style="font-size:11px;padding:6px 12px;display:inline-flex;gap:8px;align-items:center;background:#fff;border:1px solid var(--line)">' +
          esc(a) + '<button class="icon-btn" style="width:18px;height:18px;border:0" data-delamenity="' + i + '">×</button></span>';
      }).join("") +
      "</div></div></div>"
    );
  }

  function roomItem(room, i) {
    var all = S.data.roomAmenities || [];
    return (
      '<div class="item" draggable="true" data-room-idx="' + i + '">' +
      '<div class="item-head"><span class="num">' + (i + 1) + '</span><span class="drag">⠿</span>' +
      (room.image ? '<img class="mini-thumb" src="' + esc(room.image) + '">' : "") +
      "<b>" + esc(room.name || "Untitled room") + "</b>" +
      '<span class="pill ' + (room.active === false ? "cancelled" : "confirmed") + '">' + (room.active === false ? "Hidden" : "Live") + "</span>" +
      '<span class="help" style="margin:0">' + esc(money(room.price, (S.data.site || {}).currency)) + " / night</span>" +
      '<div class="spacer"></div>' +
      '<button class="icon-btn" data-duproom="' + i + '">⧉</button>' +
      '<button class="icon-btn danger" data-delroom="' + i + '">🗑</button>' +
      "</div>" +
      '<div class="item-body"><div class="grid g2">' +
      field("Room name", "rooms." + i + ".name", { ph: "Deluxe Room" }) +
      field("Nightly rate", "rooms." + i + ".price", { type: "number", min: 0, step: 50 }) +
      field("Max guests", "rooms." + i + ".guests", { type: "number", min: 1 }) +
      field("Bed setup", "rooms." + i + ".bed", { ph: "1 King Bed" }) +
      field("Room size (optional)", "rooms." + i + ".size", { ph: "220 sq ft" }) +
      field("Badge (optional)", "rooms." + i + ".badge", { ph: "Popular / New / Best Value" }) +
      "</div>" +
      field("Short description", "rooms." + i + ".description", { type: "textarea", rows: 2 }) +
      '<div class="grid g2">' +
      field("Rate note", "rooms." + i + ".priceNote", { ph: "/ night" }) +
      '<label class="f"><span>Visibility</span><select data-bool data-path="rooms.' + i + '.active">' +
      '<option value="true"' + (room.active !== false ? " selected" : "") + ">Live on website</option>" +
      '<option value="false"' + (room.active === false ? " selected" : "") + ">Hidden</option></select></label>" +
      "</div>" +
      mediaField("Room photo", "rooms." + i + ".image") +
      '<label class="f"><span>Amenities in this room</span><select multiple data-path="rooms.' + i + '.amenities">' +
      all.map(function (a) {
        return '<option value="' + esc(a) + '"' + ((room.amenities || []).indexOf(a) >= 0 ? " selected" : "") + ">" + esc(a) + "</option>";
      }).join("") + "</select><div class='help'>Hold Ctrl / Cmd to select several.</div></label>" +
      '<label class="f"><span>Extra photos (one URL per line)</span><textarea data-path="rooms.' + i + '.extraPhotos" rows="2">' + esc((room.extraPhotos || []).join("\n")) + "</textarea></label>" +
      "</div></div>"
    );
  }

  /* ===================================================== TAB: GALLERY */
  function viewGallery() {
    var g = S.data.gallery || [];
    var sec = S.data.gallerySection || {};
    return (
      '<div class="card"><div class="card-head"><h3>Gallery section text</h3><span class="hint">Headline and the background image</span></div><div class="card-body"><div class="grid g2">' +
      field("Kicker", "gallerySection.kicker") +
      field("Title", "gallerySection.title") +
      "</div>" +
      field("Subtitle", "gallerySection.subtitle", { type: "textarea", rows: 2 }) +
      field("Button text", "gallerySection.buttonText") +
      field("Photos shown in the grid", "gallerySection.showCount", { type: "number", min: 3, hint: "6 fits the layout" }) +
      mediaField("Section background image", "gallerySection.backgroundImage") +
      "</div></div>" +

      '<div class="card"><div class="card-head"><h3>Photos</h3><span class="hint">' + g.length + " photos · drag cards to reorder</span>" +
      '<div class="spacer"></div>' +
      '<label class="btn btn-gold btn-sm" style="display:inline-block">+ Upload photos<input type="file" id="multiUpload" accept="image/*" multiple style="display:none"></label>' +
      '<button class="btn btn-sm" id="addGalleryUrl">+ Add by URL</button></div>' +
      '<div class="card-body"><div class="gallery-grid-admin" id="galleryGrid">' +
      (g.length ? g.map(galleryCell).join("") : '<div class="empty">No photos yet — upload some, or paste an image URL.</div>') +
      "</div></div></div>"
    );
  }

  function galleryCell(item, i) {
    return (
      '<div class="gcell" draggable="true" data-gal-idx="' + i + '">' +
      (item.image ? '<img src="' + esc(item.image) + '" onclick="previewImage(this.src)">' : '<div style="height:105px;display:grid;place-items:center;color:#aaa;font-size:10px;background:#f4f2ec">no image</div>') +
      '<div style="padding:8px;display:flex;flex-direction:column;gap:6px">' +
      '<div class="row tight" style="flex-wrap:nowrap"><span class="drag" style="cursor:grab;font-size:15px;color:#aaa">⠿</span>' +
      '<input type="text" data-path="gallery.' + i + '.caption" value="' + esc(item.caption || "") + '" placeholder="Caption">' +
      '<button class="icon-btn" data-pick="gallery.' + i + '.image" title="Pick from library">🖼</button>' +
      '<button class="icon-btn danger" data-delgal="' + i + '" title="Remove">🗑</button></div>' +
      '<input type="text" data-path="gallery.' + i + '.image" value="' + esc(item.image || "") + '" placeholder="Image URL" style="font-size:11px">' +
      "</div></div>"
    );
  }

  /* ====================================================== TAB: OFFERS */
  function viewOffers() {
    var offers = S.data.offers || [];
    var sec = S.data.offersSection || {};
    var featured = offers.filter(function (o) { return o.type === "feature"; });
    var cards = offers.filter(function (o) { return o.type !== "feature"; });

    return (
      '<div class="card"><div class="card-head"><h3>Section text</h3></div><div class="card-body"><div class="grid g2">' +
      field("Kicker", "offersSection.kicker") + field("Title", "offersSection.title") +
      "</div>" + field("Subtitle", "offersSection.subtitle", { type: "textarea", rows: 2 }) +
      field("Link text (top right)", "offersSection.linkText") +
      field("Footnote / terms note", "offersSection.note", { type: "textarea", rows: 2 }) +
      "</div></div>" +

      '<div class="card"><div class="card-head"><h3>Featured offer card</h3><span class="hint">The large card with a background photo</span></div><div class="card-body">' +
      (featured.length ? featured.map(function (o, i) {
        return offerFields(o, offers.indexOf(o), true);
      }).join("") : '<div class="alert info">No featured card. Add one below.</div>') +
      "</div></div>" +

      '<div class="card"><div class="card-head"><h3>Offer cards</h3><span class="hint">Side cards — festival, long stay, weekday deals…</span>' +
      '<div class="spacer"></div><button class="btn btn-gold btn-sm" id="addOffer">+ Add offer card</button>' +
      '<button class="btn btn-sm" id="addFeature">+ Add featured card</button></div>' +
      '<div class="card-body">' +
      (cards.length ? cards.map(function (o) { return offerFields(o, offers.indexOf(o), false); }).join("") : '<div class="empty">No offer cards yet.</div>') +
      "</div></div>"
    );
  }

  function offerFields(o, i, isFeature) {
    return (
      '<div class="item" data-offer-idx="' + i + '"><div class="item-head">' +
      (isFeature && o.image ? '<img class="mini-thumb" src="' + esc(o.image) + '">' : "") +
      '<span class="num">✦</span><b>' + esc(o.title || "New offer") + "</b>" +
      '<span class="pill ' + (o.active === false ? "cancelled" : "confirmed") + '">' + (o.active === false ? "Hidden" : "Live") + "</span>" +
      '<div class="spacer"></div><button class="icon-btn" data-dupoffer="' + i + '">⧉</button>' +
      '<button class="icon-btn danger" data-deloffer="' + i + '">🗑</button></div>' +
      '<div class="item-body"><div class="grid g2">' +
      field("Title", "offers." + i + ".title") +
      field("Small label above title", "offers." + i + ".kicker", { ph: "LONG STAY" }) +
      "</div>" +
      field("Description", "offers." + i + ".description", { type: "textarea", rows: 2 }) +
      '<div class="grid g3">' +
      field("Badge on photo card", "offers." + i + ".badge", { ph: "SEASONAL OFFER" }) +
      field("Price text", "offers." + i + ".priceFrom", { ph: "₹1,500 / night (20% off)" }) +
      field("Valid till", "offers." + i + ".validTill", { type: "date" }) +
      "</div>" +
      field("Button text", "offers." + i + ".buttonText") +
      field("Terms / inclusions line", "offers." + i + ".terms", { type: "textarea", rows: 2 }) +
      (isFeature ? mediaField("Background photo", "offers." + i + ".image") : "") +
      '<label class="f"><span>Visibility</span><select data-bool data-path="offers.' + i + '.active">' +
      '<option value="true"' + (o.active !== false ? " selected" : "") + ">Live on website</option>" +
      '<option value="false"' + (o.active === false ? " selected" : "") + ">Hidden</option></select></label>" +
      "</div></div>"
    );
  }

  /* ======================================================= TAB: PLANS */
  function viewPlans() {
    var plans = S.data.travelPlans || [];
    var sec = S.data.travelSection || {};
    var cur = (S.data.site || {}).currency || "₹";
    return (
      '<div class="card"><div class="card-head"><h3>Travel section text</h3></div><div class="card-body">' +
      '<div class="grid g2">' + field("Kicker", "travelSection.kicker") + field("Title", "travelSection.title") + "</div>" +
      field("Description", "travelSection.subtitle", { type: "textarea", rows: 2 }) +
      field("Main button text", "travelSection.buttonText") +
      '<div class="grid g2">' + field("Card kicker", "travelSection.cardKicker") + field("Card title", "travelSection.cardTitle") + "</div>" +
      field("Card note", "travelSection.cardNote", { type: "textarea", rows: 2 }) +
      '<label class="f"><span>Feature bullets (one “Title — Subtitle” per line)</span><textarea data-lines="travelSection.points" rows="4">' +
      esc((sec.points || []).map(function (p) { return p.title + " — " + (p.subtitle || ""); }).join("\n")) + "</textarea></label>" +
      '<label class="f"><span>Itinerary rows (one “Label — Value” per line)</span><textarea data-lines="travelSection.cardRows" rows="4">' +
      esc((sec.cardRows || []).map(function (r) { return r.label + " — " + (r.value || ""); }).join("\n")) + "</textarea></label>" +
      "</div></div>" +

      '<div class="card"><div class="card-head"><h3>Custom travel plans</h3>' +
      '<span class="hint">Per-person budget, duration, min/max travellers and inclusions</span>' +
      '<div class="spacer"></div><button class="btn btn-gold btn-sm" id="addPlan">+ Add plan</button></div>' +
      '<div class="card-body">' +
      (plans.length ? plans.map(planItem).join("") : '<div class="empty">No travel plans yet. Add one to show pricing on the website.</div>') +
      "</div></div>" +
      '<div class="alert info">Each plan appears as a card under “Plan More Than Just Your Stay”. The guest can request it and the enquiry lands in <b>Enquiries</b> with the per-person price and total estimate.</div>'
    );
  }

  function planItem(p, i) {
    return (
      '<div class="item" data-plan-idx="' + i + '"><div class="item-head"><span class="num">' + (i + 1) + '</span><b>' + esc(p.name || "New plan") + "</b>" +
      '<span class="pill ' + (p.active === false ? "cancelled" : "confirmed") + '">' + (p.active === false ? "Hidden" : "Live") + "</span>" +
      '<span class="help" style="margin:0">' + esc(money(p.pricePerPerson, (S.data.site || {}).currency)) + " / person</span>" +
      '<div class="spacer"></div><button class="icon-btn" data-dupplan="' + i + '">⧉</button>' +
      '<button class="icon-btn danger" data-delplan="' + i + '">🗑</button></div>' +
      '<div class="item-body"><div class="grid g3">' +
      field("Plan name", "travelPlans." + i + ".name") +
      field("Duration (days)", "travelPlans." + i + ".days", { type: "number", min: 1 }) +
      field("Price per person (" + ((S.data.site || {}).currency || "₹") + ")", "travelPlans." + i + ".pricePerPerson", { type: "number", min: 0, step: 100 }) +
      "</div>" +
      '<div class="grid g3">' +
      field("Min travellers", "travelPlans." + i + ".minGuests", { type: "number", min: 1 }) +
      field("Max travellers", "travelPlans." + i + ".maxGuests", { type: "number", min: 1 }) +
      field("Tagline", "travelPlans." + i + ".subtitle") +
      "</div>" +
      field("Description", "travelPlans." + i + ".description", { type: "textarea", rows: 2 }) +
      '<label class="f"><span>Includes (one per line)</span><textarea data-list="travelPlans.' + i + '.includes" rows="4">' + esc((p.includes || []).join("\n")) + "</textarea></label>" +
      '<label class="f"><span>Excludes (one per line)</span><textarea data-list="travelPlans.' + i + '.excludes" rows="2">' + esc((p.excludes || []).join("\n")) + "</textarea></label>" +
      '<label class="f"><span>Visibility</span><select data-bool data-path="travelPlans.' + i + '.active">' +
      '<option value="true"' + (p.active !== false ? " selected" : "") + ">Live on website</option>" +
      '<option value="false"' + (p.active === false ? " selected" : "") + ">Hidden</option></select></label>" +
      "</div></div>"
    );
  }

  /* ================================================ TAB: TESTIMONIALS */
  function viewTestimonials() {
    var t = S.data.testimonials || [];
    return (
      '<div class="card"><div class="card-head"><h3>Section text</h3></div><div class="card-body"><div class="grid g2">' +
      field("Kicker", "testimonialsSection.kicker") + field("Title", "testimonialsSection.title") +
      "</div>" + field("Subtitle", "testimonialsSection.subtitle", { type: "textarea", rows: 2 }) +
      field("Link text", "testimonialsSection.linkText") + "</div></div>" +

      '<div class="card"><div class="card-head"><h3>Guest stories</h3>' +
      '<span class="hint">Upload a vertical MP4 clip — it plays automatically on the card</span>' +
      '<div class="spacer"></div><button class="btn btn-gold btn-sm" id="addTesti">+ Add testimonial</button></div>' +
      '<div class="card-body">' +
      (t.length ? t.map(testiItem).join("") : '<div class="empty">No testimonials yet.</div>') +
      "</div></div>"
    );
  }

  function testiItem(x, i) {
    return (
      '<div class="item" data-testi-idx="' + i + '"><div class="item-head">' +
      (x.poster ? '<img class="mini-thumb" src="' + esc(x.poster) + '">' : "") +
      '<span class="num">' + (i + 1) + '</span><b>' + esc(x.title || "New testimonial") + "</b>" +
      '<span class="pill ' + (x.active === false ? "cancelled" : "confirmed") + '">' + (x.active === false ? "Hidden" : "Live") + "</span>" +
      '<div class="spacer"></div><button class="icon-btn" data-duptesti="' + i + '">⧉</button>' +
      '<button class="icon-btn danger" data-deltesti="' + i + '">🗑</button></div>' +
      '<div class="item-body">' +
      field("Headline", "testimonials." + i + ".title") +
      field("Caption", "testimonials." + i + ".text", { type: "textarea", rows: 2 }) +
      '<div class="grid g3">' +
      field("Guest name (optional)", "testimonials." + i + ".guestName") +
      field("Rating (1–5)", "testimonials." + i + ".rating", { type: "number", min: 1, max: 5 }) +
      field("Clip label", "testimonials." + i + ".clipLabel", { ph: "SHORT CLIP" }) +
      "</div>" +
      mediaField("Video clip (optional)", "testimonials." + i + ".video", "video") +
      mediaField("Poster image", "testimonials." + i + ".poster") +
      '<label class="f"><span>Visibility</span><select data-bool data-path="testimonials.' + i + '.active">' +
      '<option value="true"' + (x.active !== false ? " selected" : "") + ">Live on website</option>" +
      '<option value="false"' + (x.active === false ? " selected" : "") + ">Hidden</option></select></label>" +
      "</div></div>"
    );
  }

  /* ======================================================= TAB: PAGES */
  function viewPages() {
    var d = S.data;
    return (
      heroCard() +
      trustCard() +
      roomsSectionCard() +
      aboutCard() +
      attractionsCard() +
      reviewsCard() +
      locationCard() +
      contactCard() +
      footerCard()
    );

    function heroCard() {
      var n = (d.nav && d.nav.links) || [];
      return '<div class="card"><div class="card-head"><h3>Header &amp; navigation</h3></div><div class="card-body"><div class="grid g3">' +
        field("Brand name", "site.brandName") + field("Tagline", "site.tagline") + field("Book button text", "nav.ctaText") +
        "</div>" +
        '<label class="f"><span>Navigation links (one “Label #anchor” per line)</span><textarea data-navlinks rows="6">' +
        esc(n.map(function (l) { return l.label + " " + (l.href || ""); }).join("\n")) + "</textarea>" +
        '<div class="help">Anchors you can use: #home #rooms #offers #gallery #travel #testimonials #about #amenities #location #contact</div></label>' +
        "</div></div>" +

        '<div class="card"><div class="card-head"><h3>Hero section</h3></div><div class="card-body"><div class="grid g2">' +
        field("Eyebrow", "hero.eyebrow") + field("Title (HTML allowed)", "hero.title") +
        "</div>" +
        field("Subtitle", "hero.subtitle", { type: "textarea", rows: 2 }) +
        '<div class="grid g3">' + field("Primary button", "hero.primaryBtn") + field("WhatsApp button", "hero.secondaryBtn") + field("Booking card title", "hero.cardTitle") + "</div>" +
        '<div class="grid g2">' + field("Booking card subtitle", "hero.cardSubtitle") + field("Show booking card", "hero.showBookingCard", { type: "checkbox" }) + "</div>" +
        "</div></div>";
    }

    function trustCard() {
      return '<div class="card"><div class="card-head"><h3>Trust strip</h3><span class="hint">The 5 highlights under the hero</span></div><div class="card-body">' +
        (d.trust || []).map(function (t, i) {
          return '<div class="grid g3" style="align-items:end;border-bottom:1px solid #f0ede6;padding-bottom:10px;margin-bottom:10px">' +
            field("Icon", "trust." + i + ".icon") + field("Title", "trust." + i + ".title") + field("Subtitle", "trust." + i + ".subtitle") +
            "</div>";
        }).join("") + "</div></div>";
    }

    function roomsSectionCard() {
      var sec = d.roomsSection || {};
      return '<div class="card"><div class="card-head"><h3>Rooms section text</h3></div><div class="card-body"><div class="grid g3">' +
        field("Kicker", "roomsSection.kicker") + field("Title", "roomsSection.title") + field("Link text", "roomsSection.linkText") +
        "</div>" + field("Subtitle", "roomsSection.subtitle", { type: "textarea", rows: 2 }) + "</div></div>";
    }

    function aboutCard() {
      return '<div class="card"><div class="card-head"><h3>About us</h3></div><div class="card-body"><div class="grid g2">' +
        field("Kicker", "aboutSection.kicker") + field("Title", "aboutSection.title") + "</div>" +
        field("Text", "aboutSection.subtitle", { type: "textarea", rows: 3 }) +
        mediaField("Photo", "aboutSection.image") +
        '<label class="f"><span>Bullet points (one per line)</span><textarea data-list="aboutSection.ticks" rows="3">' + esc((d.aboutSection.ticks || []).join("\n")) + "</textarea></label>" +
        field("Button text", "aboutSection.buttonText") + "</div></div>";
    }

    function attractionsCard() {
      return '<div class="card"><div class="card-head"><h3>Nearby attractions</h3>' +
        '<div class="spacer"></div><button class="btn btn-gold btn-sm" id="addAttraction">+ Add place</button></div>' +
        '<div class="card-body">' +
        '<div class="grid g2">' + field("Kicker", "attractionsSection.kicker") + field("Title", "attractionsSection.title") + "</div>" +
        field("Subtitle", "attractionsSection.subtitle", { type: "textarea", rows: 2 }) +
        field("Button text", "attractionsSection.buttonText") +
        '<div style="margin-top:16px">' +
        ((d.attractions || []).map(function (a, i) {
          return '<div class="item"><div class="item-head">' +
            (a.image ? '<img class="mini-thumb" src="' + esc(a.image) + '">' : '<span class="num">' + (i + 1) + "</span>") +
            "<b>" + esc(a.name) + '</b><span class="help" style="margin:0">' + esc(a.distance || "") + "</span>" +
            '<div class="spacer"></div><button class="icon-btn danger" data-delattr="' + i + '">🗑</button></div>' +
            '<div class="item-body"><div class="grid g4">' +
            field("Name", "attractions." + i + ".name") + field("Distance", "attractions." + i + ".distance") +
            field("Icon (if no photo)", "attractions." + i + ".icon", { ph: "🚉" }) +
            field("Photo URL", "attractions." + i + ".image") +
            "</div></div></div>";
        }).join("")) +
        "</div></div></div>";
    }

    function reviewsCard() {
      var rv = d.reviewsSection || {};
      return '<div class="card"><div class="card-head"><h3>Reviews</h3>' +
        '<div class="spacer"></div><button class="btn btn-gold btn-sm" id="addReview">+ Add review</button></div>' +
        '<div class="card-body"><div class="grid g2">' +
        field("Kicker", "reviewsSection.kicker") + field("Title", "reviewsSection.title") + "</div>" +
        '<div class="grid g2">' + field("Average rating", "reviewsSection.rating", { type: "number", step: "0.1", min: 0, max: 5 }) +
        field("Count line", "reviewsSection.countLabel") + "</div>" +
        ((rv.reviews || []).map(function (r, i) {
          return '<div class="item"><div class="item-head"><b>' + esc(r.name || "Guest") + "</b><div class='spacer'></div>" +
            '<button class="icon-btn danger" data-delreview="' + i + '">🗑</button></div><div class="item-body"><div class="grid g3">' +
            field("Guest name", "reviewsSection.reviews." + i + ".name") +
            field("When", "reviewsSection.reviews." + i + ".when", { ph: "Stayed 2 days ago" }) +
            field("Rating", "reviewsSection.reviews." + i + ".rating", { type: "number", min: 1, max: 5 }) +
            "</div>" + field("Review", "reviewsSection.reviews." + i + ".text", { type: "textarea", rows: 2 }) + "</div></div>";
        }).join("")) +
        "</div></div>";
    }

    function locationCard() {
      return '<div class="card"><div class="card-head"><h3>Location &amp; map</h3></div><div class="card-body"><div class="grid g2">' +
        field("CTA kicker", "locationSection.ctaEyebrow") + field("CTA title", "locationSection.ctaTitle") +
        "</div>" + field("CTA text", "locationSection.ctaText") + field("CTA button", "locationSection.ctaButton") +
        '<div class="grid g2">' + field("Map card title", "locationSection.mapTitle") + field("Directions button", "locationSection.directionsButton") + "</div>" +
        field("Map placeholder note", "locationSection.mapNote") +
        '<label class="f"><span>Google Maps embed URL</span><input type="text" data-path="site.mapEmbed" value="' + esc((d.site || {}).mapEmbed || "") +
        '" placeholder="https://www.google.com/maps/embed?pb=..."><div class="help">In Google Maps choose <b>Share → Embed a map</b> and paste the <code>src</code> link here. The demo map disappears once set.</div></label>' +
        field("Map search query for directions", "site.mapQuery", { help: "Used by the “Get Directions” button." }) +
        "</div></div>";
    }

    function contactCard() {
      return '<div class="card"><div class="card-head"><h3>Contact strip &amp; booking form</h3></div><div class="card-body">' +
        '<div class="grid g3">' + field("Kicker", "contactSection.kicker") + field("Title", "contactSection.title") + field("Button", "contactSection.primaryBtn") + "</div>" +
        field("Subtitle", "contactSection.subtitle") +
        '<div class="grid g2">' + field("Modal title", "bookingForm.title") + field("Modal subtitle", "bookingForm.subtitle") + "</div>" +
        '<div class="grid g2">' + field("Submit button text", "bookingForm.submitText") + field("WhatsApp button text", "bookingForm.whatsappButtonText") + "</div>" +
        field("Success heading", "bookingForm.successTitle") +
        field("Success message", "bookingForm.successText", { type: "textarea", rows: 2 }) +
        '<label class="check"><input type="checkbox" data-path="bookingForm.showWhatsappButton"' + ((d.bookingForm || {}).showWhatsappButton === false ? "" : " checked") + "><span>Offer the WhatsApp button in the booking modal</span></label>" +
        "</div></div>";
    }

    function footerCard() {
      return '<div class="card"><div class="card-head"><h3>Footer</h3></div><div class="card-body"><div class="grid g2">' +
        field("Brand", "footer.brand") + field("Tagline", "footer.tagline") + "</div>" +
        field("Copyright", "footer.copyright") + field("Right side note", "site.footerNote") +
        '<label class="f"><span>Footer links (one “Label #anchor” per line)</span><textarea data-footerlinks rows="4">' +
        esc(((d.footer || {}).nav || []).map(function (l) { return l.label + " " + (l.href || ""); }).join("\n")) + "</textarea></label>" +
        '<label class="f"><span>Social links — one per line: <code>Label | icon | https://…</code></span><textarea data-socials rows="4">' +
        esc(((d.footer || {}).socials || []).map(function (s) { return s.label + " | " + (s.icon || "") + " | " + (s.url || ""); }).join("\n")) +
        "</textarea></label></div></div>";
    }
  }

  /* ==================================================== TAB: BOOKINGS */
  function viewBookings() {
    var list = S.bookings.slice();
    var q = (viewBookings._q || "").toLowerCase();
    var st = viewBookings._st || "all";
    if (st !== "all") list = list.filter(function (b) { return (b.status || "new") === st; });
    if (q) list = list.filter(function (b) { return JSON.stringify(b).toLowerCase().indexOf(q) >= 0; });

    var head =
      '<div class="card"><div class="card-head"><h3>Bookings</h3>' +
      '<span class="hint">' + S.bookings.length + " total</span><div class='spacer'></div>" +
      '<input type="text" id="bq" placeholder="Search name, phone, room…" value="' + esc(viewBookings._q || "") + '" style="width:200px">' +
      '<select id="bst" style="width:140px">' + ["all", "new", "pending", "confirmed", "cancelled", "done"]
        .map(function (s) { return '<option value="' + s + '"' + (st === s ? " selected" : "") + ">" + s + "</option>"; }).join("") +
      '</select><button class="btn btn-sm" id="exportCsv">Export CSV</button></div>' +
      '<div class="card-body tight"><div class="table-wrap"><table><thead><tr>' +
      "<th>Guest</th><th>Room</th><th>Dates</th><th>Nights</th><th>Guests</th><th>Estimate</th><th>Status</th><th>Received</th><th></th>" +
      "</tr></thead><tbody>" +
      (list.length ? list.map(bookingRow).join("") : '<tr><td colspan="9"><div class="empty">No bookings match.</div></td></tr>') +
      "</tbody></table></div></div></div>";

    return head;
  }

  function bookingRow(b) {
    var st = b.status || "new";
    return '<tr data-bid="' + esc(b.id) + '"><td><b>' + esc(b.name || "") + "</b><br><small>" + esc(b.phone || b.email || "") + "</small>" +
      (b.message ? '<br><small style="color:#8b8577">' + esc(b.message.slice(0, 70)) + "</small>" : "") + "</td>" +
      "<td>" + esc(b.room || b.subject || "—") + "</td>" +
      "<td>" + esc(nice(b.checkin)) + " →<br>" + esc(nice(b.checkout)) + "</td>" +
      "<td>" + esc(b.nights || "—") + "</td><td>" + esc(b.guests || "—") + "</td>" +
      "<td>" + (b.amount ? money(b.amount, (S.data.site || {}).currency) : "—") + "</td>" +
      '<td><select data-bstatus="' + esc(b.id) + '">' + ["new", "pending", "confirmed", "cancelled", "done"]
        .map(function (s) { return '<option value="' + s + '"' + (st === s ? " selected" : "") + ">" + s + "</option>"; }).join("") + "</select></td>" +
      "<td><small>" + esc(fmtDate(b.createdAt)) + "</small></td>" +
      '<td class="row tight" style="flex-wrap:nowrap">' +
      (b.phone ? '<a class="btn btn-sm" target="_blank" rel="noopener" href="https://wa.me/' + esc(String(b.phone).replace(/\D/g, "")) +
        "?text=" + encodeURIComponent("Hello " + (b.name || "") + ", thank you for your booking request at Siddhivinayak Temple Guesthouse.") + '">W</a>' : "") +
      '<button class="icon-btn danger" data-delbooking="' + esc(b.id) + '">🗑</button></td></tr>';
  }

  function viewEnquiries() {
    var list = S.enquiries.slice();
    var st = viewEnquiries._st || "all";
    if (st !== "all") list = list.filter(function (e) { return (e.status || "new") === st; });

    return (
      '<div class="card"><div class="card-head"><h3>Enquiries</h3><span class="hint">Offer clicks and custom travel plan requests</span>' +
      '<div class="spacer"></div><select id="est" style="width:150px">' +
      ["all", "new", "pending", "confirmed", "done", "cancelled"].map(function (s) {
        return '<option value="' + s + '"' + (st === s ? " selected" : "") + ">" + s + "</option>";
      }).join("") + '</select></div>' +
      '<div class="card-body tight"><div class="table-wrap"><table><thead><tr>' +
      "<th>Guest</th><th>Type</th><th>Plan / Subject</th><th>Details</th><th>Estimate</th><th>Status</th><th>Received</th><th></th>" +
      "</tr></thead><tbody>" +
      (list.length ? list.map(enquiryRow).join("") : '<tr><td colspan="8"><div class="empty">No enquiries yet.</div></td></tr>') +
      "</tbody></table></div></div></div>"
    );
  }

  function enquiryRow(e) {
    var details = [];
    if (e.travellers) details.push("Travellers: " + e.travellers);
    if (e.nights) details.push("Days: " + e.nights);
    if (e.interests) details.push(e.interests);
    if (e.message) details.push(e.message);
    return '<tr><td><b>' + esc(e.name || "") + "</b><br><small>" + esc(e.phone || e.email || "") + "</small></td>" +
      '<td><span class="pill new">' + esc(e.kind || "general") + "</span></td>" +
      "<td>" + esc(e.plan || e.subject || "—") + "</td>" +
      '<td style="max-width:280px;font-size:11px">' + esc(details.join(" · ")) + "</td>" +
      "<td>" + (e.amount ? money(e.amount, (S.data.site || {}).currency) + (e.perPerson ? '<br><small style="color:#8b8577">' + money(e.perPerson, (S.data.site || {}).currency) + "/pp</small>" : "") : "—") + "</td>" +
      '<td><select data-estatus="' + esc(e.id) + '">' + ["new", "pending", "confirmed", "done", "cancelled"]
        .map(function (s) { return '<option value="' + s + '"' + ((e.status || "new") === s ? " selected" : "") + ">" + s + "</option>"; }).join("") + "</select></td>" +
      "<td><small>" + esc(fmtDate(e.createdAt)) + "</small></td>" +
      '<td class="row tight" style="flex-wrap:nowrap">' +
      (e.phone ? '<a class="btn btn-sm" target="_blank" rel="noopener" href="https://wa.me/' + esc(String(e.phone).replace(/\D/g, "")) +
        "?text=" + encodeURIComponent("Hello " + (e.name || "") + ", thank you for your enquiry at Siddhivinayak Temple Guesthouse.") + '">W</a>' : "") +
      '<button class="icon-btn danger" data-delenquiry="' + esc(e.id) + '">🗑</button></td></tr>';
  }

  /* ====================================================== TAB: MEDIA */
  function viewMedia() {
    return (
      '<div class="card"><div class="card-head"><h3>Upload files</h3>' +
      '<span class="hint">Photos and video clips saved under /uploads</span></div>' +
      '<div class="card-body"><div class="row">' +
      '<label class="btn btn-gold" style="display:inline-block">Choose images / videos<input type="file" id="mediaUpload" accept="image/*,video/*" multiple style="display:none"></label>' +
      '<span class="help" style="margin:0">Large videos are stored as-is. Keep testimonial clips under 20&nbsp;MB.</span>' +
      "</div><div id='uploadProgress' class='help' style='margin-top:10px'></div></div></div>" +
      '<div class="card"><div class="card-head"><h3>Library</h3><span class="hint" id="mediaCount">Loading…</span></div>' +
      '<div class="card-body"><div class="media-grid" id="mediaGrid"><div class="empty">Loading…</div></div></div></div>'
    );
  }

  function loadMedia() {
    var grid = $("#mediaGrid");
    if (!grid) return;
    api("media").then(function (r) {
      // the user may have switched tabs while this was loading
      var liveGrid = $("#mediaGrid");
      var liveCount = $("#mediaCount");
      if (!liveGrid) return;
      if (liveCount) liveCount.textContent = r.items.length + " files";
      if (!r.items.length) {
        liveGrid.innerHTML = '<div class="empty">Nothing uploaded yet.</div>';
        return;
      }
      liveGrid.innerHTML = r.items.map(function (i) {
        return '<div class="mcell" data-name="' + esc(i.name) + '">' +
          ((i.type||"").indexOf("image") === 0
            ? '<img src="' + esc(i.url) + '" loading="lazy" onclick="previewImage(this.src)">'
            : '<video src="' + esc(i.url) + '" style="width:100%;height:100px;object-fit:cover"></video>') +
          '<div class="bar"><span>' + (i.size / 1024 > 1024 ? (i.size / 1048576).toFixed(1) + " MB" : Math.round(i.size / 1024) + " KB") + "</span>" +
          '<span class="row tight" style="gap:4px"><button class="btn btn-sm" data-copy="' + esc(i.url) + '">Copy URL</button>' +
          '<button class="icon-btn danger" data-delmedia="' + esc(i.name) + '">🗑</button></span></div></div>';
      }).join("");
    });
  }

  /* ==================================================== TAB: SETTINGS */
  function viewSettings() {
    var s = S.data.site || {};
    return (
      '<div class="card"><div class="card-head"><h3>Contact details</h3></div><div class="card-body"><div class="grid g2">' +
      field("Guest house name", "site.brandName") + field("Logo mark", "site.logoMark") +
      field("WhatsApp number (with country code)", "site.whatsapp", { ph: "919999999999", help: "Digits only — used for all WhatsApp buttons." }) +
      field("Phone number", "site.phone", { ph: "+91 99999 99999" }) +
      field("Email", "site.email") + field("Address", "site.address") +
      field("Currency symbol", "site.currency") +
      "</div></div></div>" +

      '<div class="card"><div class="card-head"><h3>Location</h3></div><div class="card-body">' +
      field("Map label", "site.mapLabel") +
      field("Google Maps embed URL", "site.mapEmbed", { ph: "https://www.google.com/maps/embed?pb=..." }) +
      field("Directions search query", "site.mapQuery") +
      "</div></div>" +

      '<div class="card"><div class="card-head"><h3>Admin access</h3></div><div class="card-body">' +
      '<div class="grid g2">' +
      '<label class="f"><span>Username</span><input type="text" id="adminUser" value="' + esc(S.username || "admin") + '"></label>' +
      field("Current password", "adminPass", { type: "password" }) + "</div>" +
      field("New password (leave blank to keep current)", "adminNewPass", { type: "password" }) +
      '<button class="btn btn-gold" id="saveCreds">Update login</button>' +
      '<div class="help">After changing the password you will be signed out and asked to sign in again.</div>' +
      "</div></div>" +

      '<div class="card"><div class="card-head"><h3>Backup &amp; restore</h3></div><div class="card-body">' +
      '<div class="row"><button class="btn" id="btnBackup">Download backup (JSON)</button>' +
      '<label class="btn" style="display:inline-block">Restore from backup<input type="file" id="restoreInput" accept="application/json" style="display:none"></label>' +
      '<button class="btn btn-red" id="btnReset">Reset content to demo</button></div>' +
      '<div class="help" style="margin-top:10px">Backups include all content, bookings and enquiries. Uploaded photos stay in cloud storage and are not included in the file.</div>' +
      "</div></div>"
    );
  }

  /* ------------------------------------------------- delegated actions */
  function onClick(e) {
    var t = e.target.closest("button,[data-go]");
    if (!t) return;

    var go = t.dataset.go;
    if (go) { location.hash = go; return; }

    /* rooms */
    if (t.id === "addRoom") {
      S.data.rooms = S.data.rooms || [];
      S.data.rooms.push({ id: uid("room"), name: "New Room", image: "", gallery: [], guests: 2, bed: "1 King Bed", size: "", shortMeta: "", amenities: [], description: "", price: 1500, priceNote: "/ night", badge: "", active: true });
      markDirty(); render(); return;
    }
    if (t.dataset.delroom != null) {
      if (!confirm("Delete this room?")) return;
      S.data.rooms.splice(+t.dataset.delroom, 1); markDirty(); render(); return;
    }
    if (t.dataset.duproom != null) {
      var r = JSON.parse(JSON.stringify(S.data.rooms[+t.dataset.duproom]));
      r.id = uid("room"); r.name = r.name + " (copy)";
      S.data.rooms.splice(+t.dataset.duproom + 1, 0, r); markDirty(); render(); return;
    }
    if (t.id === "addAmenity") {
      var n = prompt("Name of the amenity (e.g. Free Wi-Fi, Laundry)");
      if (n) { S.data.roomAmenities.push(n); markDirty(); render(); }
      return;
    }
    if (t.dataset.delamenity != null) {
      S.data.roomAmenities.splice(+t.dataset.delamenity, 1); markDirty(); render(); return;
    }

    /* gallery */
    if (t.id === "addGalleryUrl") {
      var u = prompt("Paste the image URL");
      if (u) { S.data.gallery.push({ id: uid("gal"), image: u, caption: "" }); markDirty(); render(); }
      return;
    }
    if (t.dataset.delgal != null) {
      if (!confirm("Remove this photo from the gallery?")) return;
      S.data.gallery.splice(+t.dataset.delgal, 1); markDirty(); render(); return;
    }

    /* offers */
    if (t.id === "addOffer") {
      S.data.offers.push({ id: uid("offer"), type: "card", badge: "", kicker: "NEW", title: "New Offer", description: "", image: "", buttonText: "Enquire", priceFrom: "", validTill: "", terms: "", active: true });
      markDirty(); render(); return;
    }
    if (t.id === "addFeature") {
      S.data.offers.unshift({ id: uid("offer"), type: "feature", badge: "SEASONAL OFFER", kicker: "FEATURED", title: "Featured Offer", description: "", image: "", buttonText: "Check Offer", priceFrom: "", validTill: "", terms: "", active: true });
      markDirty(); render(); return;
    }
    if (t.dataset.deloffer != null) {
      if (!confirm("Delete this offer?")) return;
      S.data.offers.splice(+t.dataset.deloffer, 1); markDirty(); render(); return;
    }
    if (t.dataset.dupoffer != null) {
      var o = JSON.parse(JSON.stringify(S.data.offers[+t.dataset.dupoffer]));
      o.id = uid("offer"); o.title = o.title + " (copy)";
      S.data.offers.splice(+t.dataset.dupoffer + 1, 0, o); markDirty(); render(); return;
    }

    /* plans */
    if (t.id === "addPlan") {
      S.data.travelPlans.push({ id: uid("plan"), name: "New Travel Plan", subtitle: "", days: "2", pricePerPerson: 0, minGuests: 1, maxGuests: 10, includes: [], excludes: [], description: "", active: true });
      markDirty(); render(); return;
    }
    if (t.dataset.delplan != null) {
      if (!confirm("Delete this travel plan?")) return;
      S.data.travelPlans.splice(+t.dataset.delplan, 1); markDirty(); render(); return;
    }
    if (t.dataset.dupplan != null) {
      var p = JSON.parse(JSON.stringify(S.data.travelPlans[+t.dataset.dupplan]));
      p.id = uid("plan"); p.name = p.name + " (copy)";
      S.data.travelPlans.splice(+t.dataset.dupplan + 1, 0, p); markDirty(); render(); return;
    }

    /* testimonials */
    if (t.id === "addTesti") {
      S.data.testimonials.push({ id: uid("testi"), title: "New guest story", text: "", poster: "", video: "", clipLabel: "SHORT CLIP", guestName: "", rating: 5, active: true });
      markDirty(); render(); return;
    }
    if (t.dataset.deltesti != null) {
      if (!confirm("Delete this testimonial?")) return;
      S.data.testimonials.splice(+t.dataset.deltesti, 1); markDirty(); render(); return;
    }
    if (t.dataset.duptesti != null) {
      var x = JSON.parse(JSON.stringify(S.data.testimonials[+t.dataset.duptesti]));
      x.id = uid("testi"); x.title = x.title + " (copy)";
      S.data.testimonials.splice(+t.dataset.duptesti + 1, 0, x); markDirty(); render(); return;
    }

    /* pages */
    if (t.id === "addAttraction") {
      S.data.attractions.push({ id: uid("att"), name: "New Place", distance: "", image: "", icon: "" });
      markDirty(); render(); return;
    }
    if (t.dataset.delattr != null) {
      S.data.attractions.splice(+t.dataset.delattr, 1); markDirty(); render(); return;
    }
    if (t.id === "addReview") {
      S.data.reviewsSection.reviews.push({ id: uid("rev"), name: "Guest Name", when: "Stayed recently", rating: 5, text: "" });
      markDirty(); render(); return;
    }
    if (t.dataset.delreview != null) {
      S.data.reviewsSection.reviews.splice(+t.dataset.delreview, 1); markDirty(); render(); return;
    }

    /* bookings */
    if (t.dataset.delbooking) {
      if (!confirm("Delete this booking permanently?")) return;
      api("bookings/" + encodeURIComponent(t.dataset.delbooking), { method: "DELETE" })
        .then(function () { toast("Booking deleted"); api("bookings").then(function (r) { S.bookings = r.items; render(); }); });
      return;
    }
    if (t.id === "exportCsv") { exportCsv(); return; }

    /* enquiries */
    if (t.dataset.delenquiry) {
      if (!confirm("Delete this enquiry permanently?")) return;
      api("enquiries/" + encodeURIComponent(t.dataset.delenquiry), { method: "DELETE" })
        .then(function () { toast("Enquiry deleted"); api("enquiries").then(function (r) { S.enquiries = r.items; render(); }); });
      return;
    }

    /* media */
    if (t.dataset.delmedia) {
      if (!confirm("Delete this file permanently? It may still be used on the site.")) return;
      api("media/" + encodeURIComponent(t.dataset.delmedia), { method: "DELETE" })
        .then(function () { toast("File deleted"); loadMedia(); });
      return;
    }
    if (t.dataset.copy) {
      navigator.clipboard.writeText(location.origin + t.dataset.copy)
        .then(function () { toast("URL copied to clipboard"); })
        .catch(function () { prompt("Copy this URL:", location.origin + t.dataset.copy); });
      return;
    }

    /* settings */
    if (t.id === "saveCreds") {
      var body = {};
      if ($("#adminUser") && $("#adminUser").value) body.username = $("#adminUser").value;
      if ($("#adminPass") && $("#adminPass").value) body.currentPassword = $("#adminPass").value;
      if ($("#adminNewPass") && $("#adminNewPass").value) body.newPassword = $("#adminNewPass").value;
      if (!body.username && !body.newPassword) return toast("Enter a username or a new password", "err");
      api("credentials", { method: "POST", body: body })
        .then(function (r) {
          toast(r.restart ? "Password updated — please sign in again" : "Login details updated");
          if (r.restart) setTimeout(function () { api("session", { method: "DELETE" }).then(showLogin); }, 900);
          else render();
        })
        .catch(function (e) { toast(e.message, "err"); });
      return;
    }
    if (t.id === "btnBackup") {
      api("backup").then(function (r) {
        var blob = new Blob([JSON.stringify(r, null, 2)], { type: "application/json" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "varanasi-guest-house-backup-" + r.exportedAt.slice(0, 10) + ".json";
        a.click();
        toast("Backup downloaded");
      });
      return;
    }
    if (t.id === "btnReset") {
      if (!confirm("Reset ALL website content back to the original demo text? Bookings and enquiries are kept.")) return;
      api("content/reset", { method: "POST" }).then(function () {
        toast("Content reset to demo"); markDirty(false); loadAll();
      });
      return;
    }
  }

  function exportCsv() {
    var rows = [["Name", "Phone", "Email", "Room", "Check-in", "Check-out", "Nights", "Guests", "Estimate", "Status", "Message", "Received"]];
    viewBookings_filtered().forEach(function (b) {
      rows.push([b.name, b.phone, b.email, b.room, b.checkin, b.checkout, b.nights, b.guests, b.amount, b.status, (b.message || "").replace(/\n/g, " "), b.createdAt]);
    });
    var csv = rows.map(function (r) {
      return r.map(function (c) { return '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"'; }).join(",");
    }).join("\n");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "bookings-" + new Date().toISOString().slice(0, 10) + ".csv";
    a.click();
  }

  function viewBookings_filtered() {
    var q = (viewBookings._q || "").toLowerCase();
    var st = viewBookings._st || "all";
    var list = S.bookings.slice();
    if (st !== "all") list = list.filter(function (b) { return (b.status || "new") === st; });
    if (q) list = list.filter(function (b) { return JSON.stringify(b).toLowerCase().indexOf(q) >= 0; });
    return list;
  }

  function onInput(e) {
    // multi-select amenities / list textareas
    if (e.target.matches("select[multiple][data-path]")) {
      var vals = Array.prototype.filter.call(e.target.options, function (o) { return o.selected; }).map(function (o) { return o.value; });
      setPath(S.data, e.target.dataset.path, vals);
      markDirty();
      return;
    }
    if (e.target.matches("textarea[data-list]")) {
      setPath(S.data, e.target.dataset.list, e.target.value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean));
      markDirty();
      return;
    }
    if (e.target.matches("textarea[data-lines]")) {
      var arr = e.target.value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean).map(function (s) {
        var parts = s.split(/\s+—\s+|\s+-\s+/);
        return { title: parts[0], subtitle: parts.slice(1).join(" — ") };
      });
      setPath(S.data, e.target.dataset.lines, arr);
      markDirty();
      return;
    }
    if (e.target.matches("textarea[data-navlinks]")) {
      setPath(S.data, "nav.links", parseLinkLines(e.target.value));
      markDirty();
      return;
    }
    if (e.target.matches("textarea[data-footerlinks]")) {
      setPath(S.data, "footer.nav", parseLinkLines(e.target.value));
      markDirty();
      return;
    }
    if (e.target.matches("textarea[data-socials]")) {
      setPath(S.data, "footer.socials", e.target.value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean).map(function (line) {
        var parts = line.split("|").map(function (p) { return p.trim(); });
        return { label: parts[0] || "", icon: parts[1] || "", url: parts[2] || "" };
      }));
      markDirty();
      return;
    }
    if (e.target.id === "bq") {
      viewBookings._q = e.target.value;
      var pos = e.target.selectionStart;
      render();
      var nq = $("#bq"); nq.focus(); nq.setSelectionRange(pos, pos);
      return;
    }
    if (e.target.id === "restoreInput" && e.target.files[0]) {
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var data = JSON.parse(fr.result);
          if (!confirm("Restore this backup? Current content, bookings and enquiries will be replaced.")) return;
          api("backup", { method: "POST", body: data })
            .then(function () { toast("Backup restored"); loadAll(); });
        } catch (err) { toast("That file is not a valid backup", "err"); }
      };
      fr.readAsText(e.target.files[0]);
    }
  }

  function onChange(e) {
    // multi-selects must work whether the browser fires "input" or "change"
    if (e.target.matches("select[multiple][data-path]")) {
      var vals = Array.prototype.filter.call(e.target.options, function (o) { return o.selected; }).map(function (o) { return o.value; });
      setPath(S.data, e.target.dataset.path, vals);
      markDirty();
      return;
    }
    if (e.target.id === "bst") { viewBookings._st = e.target.value; render(); return; }
    if (e.target.id === "est") { viewEnquiries._st = e.target.value; render(); return; }

    if (e.target.id === "multiUpload" && e.target.files.length) {
      uploadFiles(e.target.files, function () { render(); });
      return;
    }
    if (e.target.id === "mediaUpload" && e.target.files.length) {
      uploadFiles(e.target.files, loadMedia);
      return;
    }

    var bs = e.target.dataset.bstatus;
    if (bs) {
      api("bookings", { method: "PUT", body: { id: bs, status: e.target.value } })
        .then(function (r) { S.bookings = r.items; toast("Booking marked " + e.target.value); updateNavCounts(); });
      return;
    }
    var es = e.target.dataset.estatus;
    if (es) {
      api("enquiries", { method: "PUT", body: { id: es, status: e.target.value } })
        .then(function (r) { S.enquiries = r.items; toast("Enquiry marked " + e.target.value); updateNavCounts(); });
      return;
    }
  }

  function uploadFiles(files, done) {
    var pending = files.length;
    var box = $("#uploadProgress");
    files.forEach(function (f) {
      readFile(f, function (dataUrl) {
        api("media", { method: "POST", body: { file: { dataUrl: dataUrl, name: f.name } } })
          .then(function (r) {
            if (S.tab === "gallery") S.data.gallery.push({ id: uid("gal"), image: r.urls[0], caption: "" });
            if (--pending === 0) {
              if (box) box.textContent = "";
              toast(files.length + " file(s) uploaded — remember to Save changes");
              markDirty();
              done();
            }
          })
          .catch(function (err) {
            toast("Upload failed: " + f.name, "err");
            if (--pending === 0) done();
          });
        if (box) box.textContent = "Uploading " + f.name + "…";
      });
    });
  }

  /* ----------------------------------------------------- drag reorder */
  function initDrag() {
    var dragging = null;
    document.addEventListener("dragstart", function (e) {
      var cell = e.target.closest("[data-gal-idx],[data-room-idx]");
      if (!cell) return;
      dragging = cell;
      cell.style.opacity = ".5";
      e.dataTransfer.effectAllowed = "move";
    });
    document.addEventListener("dragend", function () {
      if (!dragging) return;
      dragging.style.opacity = "";
      dragging = null;
    });
    document.addEventListener("dragover", function (e) {
      if (!dragging) return;
      e.preventDefault();
      var over = e.target.closest("[data-gal-idx],[data-room-idx]");
      if (!over || over === dragging) return;
      var parent = over.parentNode;
      var kids = Array.prototype.filter.call(parent.children, function (c) { return c.matches("[data-gal-idx],[data-room-idx]"); });
      var from = kids.indexOf(dragging);
      var to = kids.indexOf(over);
      if (from === -1 || to === -1) return;
      var isGal = dragging.hasAttribute("data-gal-idx");
      var list = isGal ? S.data.gallery : S.data.rooms;
      var moved = list.splice(from, 1)[0];
      list.splice(to, 0, moved);
      markDirty();
      if (isGal) {
        over.parentNode.insertBefore(dragging, from < to ? over.nextSibling : over);
      } else {
        over.parentNode.insertBefore(dragging, from < to ? over.nextSibling : over);
      }
      bindLive();
    });
  }

  /* --------------------------------------------------------- lifecycle */
  document.addEventListener("click", onClick);
  document.addEventListener("input", onInput);
  document.addEventListener("change", onChange);
  document.addEventListener("input", function (e) {
    if (e.target.matches("textarea[data-path],input[data-path],select[data-path]")) {
      if (e.target.type === "checkbox" || e.target.type === "number") return;
      var prev = document.getElementById("m_" + e.target.dataset.path.replace(/\./g, "_") + "_prev");
      if (prev && prev.tagName === "IMG" && e.target.value) prev.src = e.target.value;
    }
  });

  api("session").then(function (r) {
    S.username = r.username;
    S.tab = location.hash.replace("#", "") || "dashboard";
    if (r.authenticated) start(); else showLogin();
  }).catch(showLogin);
})();