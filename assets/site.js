/* Siddhivinayak Temple Guesthouse — public site renderer */
(function () {
  "use strict";

    var S = {
    data: null,
    submitting: false,
    demo: false   /* true when running from the static snapshot (no server) */
  };

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var esc = function (str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  };
  var money = function (n, cur) {
    var v = Number(n || 0);
    return (cur || "₹") + v.toLocaleString("en-IN");
  };
  var num = function (v) {
    var n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  };
  /* escape for an HTML attribute, keeping apostrophes literal so CSS url('…') stays valid */
  var attr = function (v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  };
  var cssUrl = function (u) { return u ? "url('" + attr(u) + "')" : ""; };

  function api(path, options) {
    return fetch("/api/" + path, options).then(function (r) {
      return r.json().then(function (body) {
        if (!r.ok) throw new Error(body.error || "Request failed");
        return body;
      });
    });
  }

  function showToast(text, isError) {
    var t = $("#toast");
    t.textContent = text;
    t.classList.toggle("error", !!isError);
    t.classList.add("show");
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove("show"); }, 3500);
  }
  window.showToast = showToast;

  function todayISO() { return new Date().toISOString().split("T")[0]; }

  function nightsBetween(a, b) {
    if (!a || !b) return 0;
    var d = (new Date(b) - new Date(a)) / 86400000;
    return d > 0 ? Math.floor(d) : 0;
  }

  /* ----------------------------------------------------------- renderers */

  function renderChrome() {
    var d = S.data, site = d.site || {};
    document.title = (site.brandName || "Siddhivinayak Temple Guesthouse") + " | " + (site.tagline || "");
    $("#brandName").textContent = site.brandName || "";
    $("#brandTagline").textContent = site.tagline || "";
    $("#brandMark").textContent = site.logoMark || "";
    $("#navBookBtn").textContent = (d.nav && d.nav.ctaText) || "Book Now";

    var links = (d.nav && d.nav.links) || [];
    $("#navLinks").innerHTML = links
      .map(function (l) { return '<a href="' + esc(l.href) + '">' + esc(l.label) + "</a>"; })
      .join("");

    $("#footerBrand").textContent = (d.footer && d.footer.brand) || site.brandName || "";
    $("#footerTagline").textContent = (d.footer && d.footer.tagline) || site.tagline || "";
    $("#footerNav").innerHTML = ((d.footer && d.footer.nav) || [])
      .map(function (l) { return '<a href="' + esc(l.href) + '">' + esc(l.label) + "</a>"; })
      .join("");
    $("#footerSocial").innerHTML = ((d.footer && d.footer.socials) || [])
      .map(function (s) {
        var inner = esc(s.icon || s.label);
        return s.url
          ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener" title="' + esc(s.label) + '"><span>' + inner + "</span></a>"
          : '<span title="' + esc(s.label) + '">' + inner + "</span>";
      })
      .join("");
    $("#footerCopyright").textContent = (d.footer && d.footer.copyright) || "";
    $("#footerNote").textContent = site.footerNote || "";
  }

  function sectionHead(sec, linkText) {
    return (
      '<div class="section-head"><div>' +
      '<div class="kicker">' + esc(sec.kicker || "") + "</div>" +
      "<h3>" + esc(sec.title || "") + "</h3>" +
      '<p>' + esc(sec.subtitle || "") + "</p></div>" +
      (linkText ? '<a class="text-link" href="#contact">' + esc(linkText) + "</a>" : "") +
      "</div>"
    );
  }

  function renderHero() {
    var d = S.data, h = d.hero || {};
    var link = '<a class="btn btn-outline" target="_blank" rel="noopener" href="' + whatsappLink(h.secondaryBtn) + '">◯ &nbsp; ' + esc(h.secondaryBtn || "WhatsApp Us") + "</a>";

    var card = "";
    if (h.showBookingCard !== false) {
      var guests = (d.bookingForm && d.bookingForm.guests) || ["1 Guest", "2 Guests"];
      card =
        '<div class="booking-card"><h3>' + esc(h.cardTitle || "Book Your Stay") + "</h3>" +
        "<small>" + esc(h.cardSubtitle || "") + "</small>" +
        '<div class="field"><label>Check-in Date</label><input id="heroIn" type="date"></div>' +
        '<div class="field"><label>Check-out Date</label><input id="heroOut" type="date"></div>' +
        '<div class="field"><label>Guests</label><select id="heroGuests">' +
        guests.map(function (g) { return "<option>" + esc(g) + "</option>"; }).join("") +
        '</select></div><button class="btn btn-gold" onclick="checkAvailability()">Check Availability</button></div>';
    }

    return (
      '<section id="home" class="hero"><div class="container hero-grid"><div>' +
      '<div class="eyebrow">' + esc(h.eyebrow || "") + "</div>" +
      "<h2>" + (h.title || "") + "</h2>" +
      "<p>" + esc(h.subtitle || "") + "</p>" +
      '<div class="actions"><button class="btn btn-gold" onclick="openBooking()">▣ &nbsp; ' + esc(h.primaryBtn || "Book Your Stay") + "</button>" +
      (h.showWhatsapp === false ? "" : link) +
      "</div></div>" + card +
      "</div></section>"
    );
  }

  function renderTrust() {
    return (
      '<section class="trust"><div class="container trust-grid">' +
      (S.data.trust || []).map(function (t) {
        return '<div class="trust-item"><div class="trust-icon">' + esc(t.icon || "") + "</div><b>" +
          esc(t.title || "") + "</b><span>" + esc(t.subtitle || "") + "</span></div>";
      }).join("") +
      "</div></section>"
    );
  }

  function activeRooms() {
    return (S.data.rooms || []).filter(function (r) { return r.active !== false; });
  }

  function renderRooms() {
    var sec = S.data.roomsSection || {};
    return (
      '<section id="rooms" class="section cream"><div class="container">' +
      sectionHead(sec, sec.linkText) +
      '<div class="rooms" id="roomsGrid">' +
      activeRooms().map(roomCard).join("") +
      "</div></div></section>"
    );
  }

  function roomCard(room) {
    var cur = (S.data.site && S.data.site.currency) || "₹";
    var meta = ["♙ " + esc(room.guests) + " Guests", "🛏 " + esc(room.bed)];
    if (room.size) meta.push("⌂ " + esc(room.size));
    var chips = (room.amenities || []).slice(0, 4).map(function (a) {
      return '<span class="chip">' + esc(a) + "</span>";
    }).join("");

    return (
      '<article class="room"><div class="room-img-wrap">' +
      (room.image
        ? '<img src="' + esc(room.image) + '" alt="' + esc(room.name) + '" loading="lazy">'
        : '<div class="room-noimg">' + esc(room.name.charAt(0) || "•") + "</div>") +
      (room.badge ? '<span class="room-badge">' + esc(room.badge) + "</span>" : "") +
      "</div>" +
      '<div class="room-body"><h4>' + esc(room.name) + "</h4>" +
      '<div class="meta">' + meta.join(" · ") + "</div>" +
      (room.description ? '<p class="room-desc">' + esc(room.description) + "</p>" : "") +
      (chips ? '<div class="amenity-chips">' + chips + "</div>" : "") +
      '<div class="price-row"><div class="price">' + money(room.price, cur) +
      " <span>" + esc(room.priceNote || "/ night") + "</span></div>" +
      '<button class="btn btn-gold mini-btn" onclick="openBooking(\'' + esc(room.name).replace(/'/g, "") + '\')">Book Now</button></div>' +
      "</div></article>"
    );
  }

  function renderOffers() {
    var sec = S.data.offersSection || {};
    var offers = (S.data.offers || []).filter(function (o) { return o.active !== false; });
    var feature = offers.filter(function (o) { return o.type === "feature"; });
    var cards = offers.filter(function (o) { return o.type !== "feature"; });

    var html =
      '<section id="offers" class="section black-section"><div class="container">' +
      sectionHead(sec, sec.linkText) + '<div class="offers-grid">';

    feature.forEach(function (o) {
      var style = o.image ? "background-image:" + cssUrl(o.image) : "";
      html +=
        '<article class="offer-feature"' + style + '><div class="offer-overlay">' +
        (o.badge ? '<span class="offer-badge">' + esc(o.badge) + "</span>" : "") +
        "<h4>" + esc(o.title) + "</h4><p>" + esc(o.description) + "</p>" +
        (o.priceFrom ? '<div class="offer-price">' + esc(o.priceFrom) + "</div>" : "") +
        '<button class="btn btn-gold" style="margin-top:14px" onclick="openOffer(\'' + esc(o.id) + '\')">' + esc(o.buttonText || "Check Offer") + "</button>" +
        "</div></article>";
    });

    cards.forEach(function (o) {
      html +=
        '<article class="offer-card' + (o.image ? " has-image" : "") + '"' +
        (o.image ? ' style="background-image:' + cssUrl(o.image) + '"' : "") + ">" +
        (o.kicker ? '<div class="offer-number">' + esc(o.kicker) + "</div>" : "") +
        "<h4>" + esc(o.title) + "</h4><p>" + esc(o.description) + "</p>" +
        (o.priceFrom ? '<div class="offer-price">' + esc(o.priceFrom) + "</div>" : "") +
        (o.validTill ? '<div class="offer-terms">Valid till ' + esc(o.validTill) + "</div>" : "") +
        '<button class="btn btn-light-gold" style="margin-top:14px;align-self:flex-start" onclick="openOffer(\'' + esc(o.id) + '\')">' + esc(o.buttonText || "Enquire") + "</button>" +
        (o.terms ? '<div class="offer-terms">' + esc(o.terms) + "</div>" : "") +
        "</article>";
    });

    html += "</div>" + (sec.note ? '<div class="offer-note">' + esc(sec.note) + "</div>" : "") + "</div></section>";
    return html;
  }

  function renderGallery() {
    var sec = S.data.gallerySection || {};
    var items = (S.data.gallery || []).filter(function (g) { return g.image; });
    var limit = Number(sec.showCount) > 0 ? Number(sec.showCount) : items.length;
    var style = sec.backgroundImage
      ? "background-image:linear-gradient(90deg,rgba(8,7,5,.93),rgba(8,7,5,.78))," + cssUrl(sec.backgroundImage)
      : "";

    return (
      '<section id="gallery" class="section gallery"' + style + '><div class="container gallery-grid"><div>' +
      '<div class="kicker">' + esc(sec.kicker || "") + "</div>" +
      "<h3>" + esc(sec.title || "") + "</h3><p>" + esc(sec.subtitle || "") + "</p>" +
      '<button class="btn btn-outline" style="width:max-content;margin-top:14px" onclick="openLightboxFirst()">' + esc(sec.buttonText || "View All Photos →") + "</button></div>" +
      '<div class="gallery-images">' +
      items.slice(0, limit).map(function (g, i) {
        return '<img src="' + esc(g.image) + '" alt="' + esc(g.caption || "Gallery") + '" loading="lazy" onclick="openLightboxAt(' + i + ')">';
      }).join("") +
      "</div></div></section>"
    );
  }

  function renderTravel() {
    var sec = S.data.travelSection || {};
    var plans = (S.data.travelPlans || []).filter(function (p) { return p.active !== false; });
    var cur = (S.data.site && S.data.site.currency) || "₹";

    var planHtml = "";
    if (plans.length) {
      planHtml =
        '<div class="plan-grid">' +
        plans.map(function (p) {
          return (
            '<div class="plan-card"><h5>' + esc(p.name) + "</h5>" +
            '<p class="plan-sub">' + esc(p.subtitle || "") + "</p>" +
            '<div class="plan-price">' + money(p.pricePerPerson, cur) + " <small>/ person</small></div>" +
            '<div class="plan-meta">' + esc(p.days) + " day(s) · " + esc(p.minGuests || 1) +
            (p.maxGuests ? "–" + esc(p.maxGuests) : "+") + " travellers</div>" +
            (p.includes && p.includes.length
              ? '<ul class="plan-includes">' + p.includes.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + "</ul>"
              : "") +
            '<button class="btn btn-light-gold" style="margin-top:16px;align-self:flex-start" onclick="openPlan(\'' + esc(p.id) + '\')">Request This Plan</button>' +
            "</div>"
          );
        }).join("") +
        "</div>";
    }

    return (
      '<section id="travel" class="section travel-section"><div class="container travel-grid"><div>' +
      '<div class="kicker">' + esc(sec.kicker || "") + "</div>" +
      "<h3>" + esc(sec.title || "") + "</h3><p>" + esc(sec.subtitle || "") + "</p>" +
      '<div class="travel-points">' +
      (sec.points || []).map(function (p) {
        return "<div><b>" + esc(p.title) + "</b><span>" + esc(p.subtitle || "") + "</span></div>";
      }).join("") +
      "</div>" +
      '<button class="btn btn-gold" onclick="openPlan()">' + esc(sec.buttonText || "Request a Custom Travel Plan →") + "</button>" +
      "</div>" +
      '<div class="travel-card"><div class="kicker">' + esc(sec.cardKicker || "") + "</div>" +
      "<h4>" + esc(sec.cardTitle || "") + "</h4>" +
      (sec.cardRows || []).map(function (r) {
        return '<div class="travel-row"><span>' + esc(r.label) + "</span><b>" + esc(r.value) + "</b></div>";
      }).join("") +
      (sec.cardNote ? '<p class="travel-note">' + esc(sec.cardNote) + "</p>" : "") +
      "</div></div>" + planHtml + "</section>"
    );
  }

  function renderTestimonials() {
    var sec = S.data.testimonialsSection || {};
    var items = (S.data.testimonials || []).filter(function (t) { return t.active !== false; });

    return (
      '<section id="testimonials" class="section cream"><div class="container">' +
      sectionHead(sec, sec.linkText) +
      '<div class="testimonial-grid">' +
      items.map(function (t) {
        var posterStyle = t.poster
          ? "background-image:linear-gradient(#0004,#0007)," + cssUrl(t.poster)
          : "background-image:linear-gradient(#0004,#0007),#12110f";
        var stars = t.rating ? '<div class="testimonial-stars">' + "★".repeat(Math.max(0, Math.min(5, Number(t.rating) || 0))) + "</div>" : "";
        var media = t.video
          ? '<div class="clip-wrap"><video class="clip-video" src="' + esc(t.video) + '" poster="' + esc(t.poster || "") + '" muted loop playsinline></video>' +
            (t.clipLabel ? '<span class="clip-label">' + esc(t.clipLabel) + "</span>" : "") +
            '<button class="clip-play" onclick="playClip(this)" aria-label="Play clip">▶</button></div>'
          : '<div class="video-poster" style="' + posterStyle + '" onclick="openOffer(\'testi:' + esc(t.id) + '\')">' +
            '<span class="play-button">▶</span>' +
            (t.clipLabel ? '<span class="clip-label">' + esc(t.clipLabel) + "</span>" : "") +
            "</div>";

        return (
          '<article class="testimonial-video">' + media +
          '<div class="testimonial-copy">' + stars + "<h4>" + esc(t.title) + "</h4>" +
          "<p>" + esc(t.text) + "</p>" +
          (t.guestName ? '<p style="margin-top:6px;color:#c89a3c">— ' + esc(t.guestName) + "</p>" : "") +
          "</div></article>"
        );
      }).join("") +
      "</div></div></section>"
    );
  }

  function renderInfo() {
    var d = S.data, a = d.aboutSection || {}, as = d.attractionsSection || {}, rv = d.reviewsSection || {};
    var site = d.site || {};

    var attractions = (d.attractions || []).map(function (p) {
      var thumb = p.image
        ? '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy">'
        : '<div class="place-icon">' + esc(p.icon || "•") + "</div>";
      return '<div class="place">' + thumb + esc(p.name) + "<span>" + esc(p.distance || "") + "</span></div>";
    }).join("");

    var reviews = (rv.reviews || []).map(function (r) {
      var st = r.rating ? '<span class="stars">' + "★".repeat(r.rating) + "</span> " : "";
      return '<div class="review">' + st + "<b>" + esc(r.name) + "</b><small>" + esc(r.when || "") + "</small>" +
        "“" + esc(r.text) + "”</div>";
    }).join("");

    return (
      '<section id="about" class="section"><div class="container info-grid">' +
      '<div class="info-card">' +
      (a.image ? '<img class="about-img" src="' + esc(a.image) + '" alt="About">' : '<div class="about-img about-noimg"></div>') +
      "</div>" +
      '<div class="info-card"><div class="kicker">' + esc(a.kicker || "") + "</div>" +
      "<h4>" + esc(a.title || "") + "</h4><p>" + esc(a.subtitle || "") + "</p>" +
      '<ul class="ticks">' + (a.ticks || []).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" +
      '<button class="btn btn-dark-outline" onclick="document.getElementById(\'contact\').scrollIntoView()">' + esc(a.buttonText || "") + "</button></div>" +
      '<div id="amenities" class="info-card attractions"><div class="kicker">' + esc(as.kicker || "") + "</div>" +
      "<h4>" + esc(as.title || "") + "</h4><p>" + esc(as.subtitle || "") + "</p>" + attractions +
      '<button class="btn btn-dark-outline" style="margin-top:14px" onclick="document.getElementById(\'location\').scrollIntoView()">' + esc(as.buttonText || "View on Map →") + "</button></div>" +
      '<div class="info-card review-box"><div class="kicker">' + esc(rv.kicker || "") + "</div>" +
      "<h4>" + esc(rv.title || "") + "</h4>" +
      '<div class="stars">' + "★".repeat(Math.round(Number(rv.rating) || 0)) + ' <span class="rating">' + esc(rv.rating) + "/5</span></div>" +
      '<div class="rating">' + esc(rv.countLabel || "") + "</div>" + reviews +
      "</div></div></section>"
    );
  }

  function renderLocation() {
    var sec = S.data.locationSection || {}, site = S.data.site || {};
    var mapInner = site.mapEmbed
      ? '<iframe class="map-embed" src="' + esc(site.mapEmbed) + '" allowfullscreen loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>'
      : '<div class="map-placeholder">📍 ' + esc(site.mapLabel || site.brandName) +
        "<br><small>" + esc(sec.mapNote || "") + "</small></div>";

    return (
      '<section id="location" class="section" style="padding-top:0"><div class="container cta-map">' +
      '<div class="cta"><div class="eyebrow">' + esc(sec.ctaEyebrow || "") + "</div>" +
      "<h4>" + esc(sec.ctaTitle || "") + "</h4><p>" + esc(sec.ctaText || "") + "</p>" +
      '<button class="btn btn-gold" style="width:max-content" onclick="openBooking()">' + esc(sec.ctaButton || "Book Now →") + "</button></div>" +
      '<div class="map-card"><h4>' + esc(sec.mapTitle || "") + "</h4>" + mapInner +
      '<button class="btn btn-gold" style="margin-top:10px" onclick="openMaps()">' + esc(sec.directionsButton || "Get Directions →") + "</button></div>" +
      "</div></section>"
    );
  }

  function renderContact() {
    var sec = S.data.contactSection || {}, site = S.data.site || {};
    return (
      '<section id="contact" class="section cream" style="padding:35px 0"><div class="container" style="text-align:center">' +
      '<div class="kicker">' + esc(sec.kicker || "") + "</div><h3>" + esc(sec.title || "") + "</h3>" +
      '<p style="font-size:12px;color:#6d7780">' + esc(sec.subtitle || "") + "</p>" +
      '<div class="actions" style="justify-content:center">' +
      '<button class="btn btn-gold" onclick="openBooking()">' + esc(sec.primaryBtn || "Book Your Stay") + "</button>" +
      '<a class="btn btn-dark-outline" href="tel:' + esc(String(site.phone || "").replace(/\s/g, "")) + '">Call ' + esc(site.phone || "") + "</a>" +
      '<a class="btn btn-dark-outline" target="_blank" rel="noopener" href="' + whatsappLink("WhatsApp") + '">WhatsApp</a>' +
      "</div></div></section>"
    );
  }

  function renderAll() {
    renderChrome();
    $("#app").innerHTML =
      renderHero() + renderTrust() + renderRooms() + renderOffers() + renderGallery() +
      renderTravel() + renderTestimonials() + renderInfo() + renderLocation() + renderContact();

    fillRoomSelect();
    fillPlanSelect();
    syncDates();
    initClipPlayers();
  }

  /* ------------------------------------------------------- interactions */

  function fillRoomSelect() {
    var sel = $("#roomSelect");
    sel.innerHTML = activeRooms()
      .map(function (r) { return '<option value="' + esc(r.name) + '">' + esc(r.name) + " — " + money(r.price, (S.data.site || {}).currency) + "</option>"; })
      .join("") || "<option>Any room</option>";

    var gs = $("#guests");
    gs.innerHTML = ((S.data.bookingForm || {}).guests || ["1 Guest", "2 Guests"])
      .map(function (g) { return "<option>" + esc(g) + "</option>"; }).join("");
    updateTotal();
  }

  function fillPlanSelect() {
    var plans = (S.data.travelPlans || []).filter(function (p) { return p.active !== false; });
    $("#planSelect").innerHTML =
      '<option value="">Custom / not sure yet</option>' +
      plans.map(function (p) {
        return '<option value="' + esc(p.name) + '" data-price="' + num(p.pricePerPerson) + '">' +
          esc(p.name) + " — " + money(p.pricePerPerson, (S.data.site || {}).currency) + "/person</option>";
      }).join("");
    updatePlanEstimate();
  }

  function selectedRoom() {
    var name = $("#roomSelect").value;
    return activeRooms().filter(function (r) { return r.name === name; })[0];
  }

  function updateTotal() {
    var room = selectedRoom();
    if (!room) return;
    var n = nightsBetween($("#checkin").value, $("#checkout").value);
    var cur = (S.data.site || {}).currency || "₹";
    var guests = parseInt($("#guests").value, 10) || 1;
    $("#totalBox").value = n > 0 ? money(num(room.price) * n, cur) + " (" + n + " night" + (n > 1 ? "s" : "") + ")" : "Select dates";
  }

  function updatePlanEstimate() {
    var opt = $("#planSelect").selectedOptions[0];
    var price = opt ? num(opt.getAttribute("data-price")) : 0;
    var people = num($("#planTravellers").value) || 1;
    var cur = (S.data.site || {}).currency || "₹";
    $("#planEstimate").innerHTML = price > 0
      ? "Indicative price: <b>" + money(price, cur) + " / person</b> × " + people + " traveller(s) = <b>" + money(price * people, cur) + "</b><br><small style=\"color:#8a8378\">Final itinerary, pricing and inclusions are confirmed by the guest house.</small>"
      : "Tell us your trip duration, travellers and interests and we will send a tailored plan with a per-person budget.";
  }

  function syncDates() {
    var t = todayISO();
    ["heroIn", "checkin"].forEach(function (id) { var el = $("#" + id); if (el) el.min = t; });
    ["heroOut", "checkout"].forEach(function (id) { var el = $("#" + id); if (el) el.min = t; });
  }

  function whatsappLink(label) {
    var site = S.data ? S.data.site || {} : {};
    var msg = encodeURIComponent("Hello " + (site.brandName || "Siddhivinayak Temple Guesthouse") + ", I would like to know more" + (label ? " about " + label : "") + ".");
    return "https://wa.me/" + (site.whatsapp || "") + "?text=" + msg;
  }

  window.openBooking = function (room) {
    $("#bookingModal").classList.add("show");
    $("#bookingFormWrap").style.display = "";
    $("#success").style.display = "none";
    if (room) {
      var sel = $("#roomSelect");
      for (var i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === room) sel.selectedIndex = i;
      }
    }
    $("#bookingTitle").textContent = (S.data.bookingForm || {}).title || "Reserve Your Stay";
    $("#bookingSubtitle").textContent = (S.data.bookingForm || {}).subtitle || "";
    var bf = S.data.bookingForm || {};
    $("#submitBookingBtn").textContent = bf.submitText || "Send Booking Request";
    $("#whatsappBookingBtn").style.display = bf.showWhatsappButton === false ? "none" : "";
    $("#whatsappBookingBtn").textContent = bf.whatsappButtonText || "Also send on WhatsApp";
    updateSummary();
    document.body.style.overflow = "hidden";
  };
  window.closeBooking = function () {
    $("#bookingModal").classList.remove("show");
    document.body.style.overflow = "";
  };

  function updateSummary() {
    var room = selectedRoom();
    $("#bookingSummary").innerHTML =
      "Room: <b>" + esc($("#roomSelect").value || "—") + "</b>" +
      (room ? " · " + money(room.price, (S.data.site || {}).currency) + esc(room.priceNote || "") : "") +
      "<br>Select your dates and guest count — your request goes straight to the guest house team.";
    updateTotal();
  }

  window.checkAvailability = function () {
    var ci = $("#heroIn").value, co = $("#heroOut").value;
    if (!ci || !co) return showToast("Please select both check-in and check-out dates.", true);
    if (new Date(co) <= new Date(ci)) return showToast("Check-out must be after check-in.", true);
    $("#checkin").value = ci;
    $("#checkout").value = co;
    $("#guests").value = $("#heroGuests").value;
    openBooking();
  };

  $("#whatsappBookingBtn") && $("#whatsappBookingBtn").addEventListener("click", sendWhatsAppOnly);

  function sendWhatsAppOnly() {
    const name = $("#name").value.trim() || "Guest";
    const msg =
      "Hello " + ((S.data.site || {}).brandName || "Siddhivinayak Temple Guesthouse") + ",%0A%0AI want to request a booking.%0A%0A" +
      "Name: " + encodeURIComponent(name) + "%0APhone: " + encodeURIComponent($("#phone").value.trim()) + "%0A" +
      "Room: " + encodeURIComponent($("#roomSelect").value) + "%0ACheck-in: " + encodeURIComponent($("#checkin").value) +
      "%0ACheck-out: " + encodeURIComponent($("#checkout").value) + "%0AGuests: " + encodeURIComponent($("#guests").value) +
      "%0ASpecial request: " + encodeURIComponent($("#request").value.trim() || "None");
    window.open("https://wa.me/" + ((S.data.site || {}).whatsapp || "") + "?text=" + msg, "_blank");
  }

  function post(payload) {
    return api("submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  }

  async function submitBooking() {
    if (S.demo) return showToast("This is a demo preview. Bookings go live on the hosted server.", true);
    if (S.submitting) return;
    const name = $("#name").value.trim();
    const phone = $("#phone").value.trim();
    const ci = $("#checkin").value, co = $("#checkout").value;
    if (!name || !phone || !ci || !co) return showToast("Please complete name, phone and dates.", true);
    if (new Date(co) <= new Date(ci)) return showToast("Check-out must be after check-in.", true);

    const room = selectedRoom();
    const nights = nightsBetween(ci, co);
    const cur = (S.data.site || {}).currency || "";

    S.submitting = true;
    const btn = $("#submitBookingBtn");
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Sending…";
    try {
      const res = await post({
        kind: "booking",
        company: $("#honey").value,
        name: name,
        phone: phone,
        email: $("#email").value.trim(),
        room: $("#roomSelect").value,
        checkin: ci,
        checkout: co,
        guests: $("#guests").value,
        nights: nights,
        amount: room ? num(room.price) * nights : null,
        message: $("#request").value.trim(),
        source: "website booking form",
        subject: room ? room.name : "Booking request"
      });
      $("#bookingFormWrap").style.display = "none";
      $("#success").style.display = "block";
      $("#successTitle").textContent = (S.data.bookingForm || {}).successTitle || "Request Received";
      $("#successText").textContent = (S.data.bookingForm || {}).successText || "Thank you.";
      $("#successRef").textContent =
        "Reference " + String(res.id || "").slice(-6).toUpperCase() +
        (room ? " · Estimated " + cur + (num(room.price) * nights).toLocaleString("en-IN") + " for " + nights + " night(s)" : "");
      $("#bookingFormWrap").reset();
      if ((S.data.bookingForm || {}).showWhatsappButton !== false) setTimeout(sendWhatsAppOnly, 400);
    } catch (err) {
      showToast("Could not send your request: " + err.message, true);
    } finally {
      S.submitting = false;
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  window.openPlan = function (planId) {
    $("#planModal").classList.add("show");
    if (planId) {
      var plans = S.data.travelPlans || [];
      var p = plans.filter(function (x) { return x.id === planId; })[0];
      if (p) {
        $("#planSelect").value = p.name;
        if (p.days) $("#planDays").value = num(p.days);
      }
    }
    updatePlanEstimate();
    document.body.style.overflow = "hidden";
  };
  window.closePlan = function () {
    $("#planModal").classList.remove("show");
    document.body.style.overflow = "";
  };

  window.submitPlanEnquiry = async function () {
    if (S.demo) return showToast("This is a demo preview. Enquiries go live on the hosted server.", true);
    if (S.submitting) return;
    var name = $("#planName").value.trim();
    var phone = $("#planPhone").value.trim();
    if (!name || !phone) return showToast("Please enter your name and phone number.", true);

    var opt = $("#planSelect").selectedOptions[0];
    var perPerson = opt ? num(opt.getAttribute("data-price")) : 0;
    var travellers = num($("#planTravellers").value) || 1;

    S.submitting = true;
    try {
      var res = await post({
        kind: "plan",
        company: $("#planHoney").value,
        name: name,
        phone: phone,
        email: $("#planEmail").value.trim(),
        plan: $("#planSelect").value,
        travellers: String($("#planTravellers").value),
        perPerson: perPerson || null,
        amount: perPerson ? perPerson * travellers : null,
        nights: num($("#planDays").value),
        interests: $("#planInterests").value,
        message: $("#planMessage").value.trim(),
        source: "website travel plan form",
        subject: $("#planSelect").value || "Custom travel plan"
      });
      $("#planModal").classList.remove("show");
      $("#planName").value = ""; $("#planPhone").value = ""; $("#planEmail").value = ""; $("#planMessage").value = "";
      document.body.style.overflow = "";
      showToast("Travel plan request received! Reference " + String(res.id || "").slice(-6).toUpperCase());
    } catch (err) {
      showToast("Could not send your request: " + err.message, true);
    } finally {
      S.submitting = false;
    }
  };

  window.openOffer = function (idOrTitle) {
    var d = S.data;
    if (String(idOrTitle).indexOf("testi:") === 0) {
      var t = (d.testimonials || []).filter(function (x) { return x.id === String(idOrTitle).slice(6); })[0];
      if (!t) return;
      $("#offerTitle").textContent = t.title;
      $("#offerText").textContent = t.text + (t.video ? "" : " Guest video clips can be added from the admin panel.");
      $("#offerMeta").innerHTML = t.guestName ? "Guest: <b>" + esc(t.guestName) + "</b>" : "";
      $("#offerModal").classList.add("show");
      document.body.style.overflow = "hidden";
      return;
    }
    var o = (d.offers || []).filter(function (x) { return x.id === idOrTitle || x.title === idOrTitle; })[0];
    if (!o) return showToast("This offer is no longer available.", true);
    $("#offerTitle").textContent = o.title;
    $("#offerText").textContent = o.description;
    var meta = "";
    if (o.priceFrom) meta += "Price: <b>" + esc(o.priceFrom) + "</b><br>";
    if (o.validTill) meta += "Valid till: <b>" + esc(o.validTill) + "</b><br>";
    if (o.terms) meta += esc(o.terms);
    $("#offerMeta").innerHTML = meta || "Send an enquiry and our team will share the exact rate and inclusions.";
    $("#offerModal").classList.add("show");
    document.body.style.overflow = "hidden";
  };
  window.closeOffer = function () {
    $("#offerModal").classList.remove("show");
    document.body.style.overflow = "";
  };

  var lightboxList = [];
  window.openLightboxAt = function (i) {
    var items = (S.data.gallery || []).filter(function (g) { return g.image; });
    if (!items[i]) return;
    lightboxList = items;
    $("#lightboxImg").src = items[i].image;
    $("#lightbox").classList.add("show");
    document.body.style.overflow = "hidden";
  };
  window.openLightboxFirst = function () { window.openLightboxAt(0); };
  window.closeLightbox = function () {
    $("#lightbox").classList.remove("show");
    document.body.style.overflow = "";
  };
  document.addEventListener("keydown", function (e) {
    if (!$("#lightbox").classList.contains("show")) return;
    if (e.key === "Escape") return window.closeLightbox();
    if (e.key === "ArrowRight") step(1);
    if (e.key === "ArrowLeft") step(-1);
  });
  function step(dir) {
    var i = lightboxList.map(function (g) { return g.image; }).indexOf($("#lightboxImg").src.replace(location.origin, ""));
    if (i === -1) i = 0;
    var next = (i + dir + lightboxList.length) % lightboxList.length;
    $("#lightboxImg").src = lightboxList[next].image;
  }

  window.playClip = function (btn) {
    var v = btn.closest(".clip-wrap").querySelector("video");
    if (!v) return;
    if (v.paused) { v.play(); btn.style.display = "none"; }
    else { v.pause(); btn.style.display = ""; }
  };
  function initClipPlayers() {
    document.querySelectorAll(".clip-video").forEach(function (v) {
      v.addEventListener("click", function () { if (v.paused) v.play(); else v.pause(); });
    });
  }

  window.openMaps = function () {
    var q = (S.data.site || {}).mapQuery || (S.data.site || {}).brandName || "Siddhivinayak Temple Guesthouse";
    window.open("https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q), "_blank");
  };

  window.toggleMobileNav = function () {
    var nav = $("#navLinks");
    if (getComputedStyle(nav).display === "none") {
      nav.style.cssText = "display:flex;position:absolute;top:66px;left:0;right:0;background:#090908;padding:15px 24px;flex-direction:column;gap:12px;box-shadow:0 8px 20px rgba(0,0,0,.08)";
    } else nav.style.cssText = "";
  };

  document.addEventListener("DOMContentLoaded", function () {
    if (window.VGH_OFFLINE) return;
    var btn = $("#submitBookingBtn");
    if (btn) btn.addEventListener("click", submitBooking);

    ["checkin", "checkout", "guests", "roomSelect"].forEach(function (id) {
      var el = $("#" + id);
      if (el) el.addEventListener("change", updateSummary);
    });
    ["planSelect", "planTravellers", "planDays"].forEach(function (id) {
      var el = $("#" + id);
      if (el) el.addEventListener("input", updatePlanEstimate);
      if (el) el.addEventListener("change", updatePlanEstimate);
    });

    fetch("/api/content")
      .then(function (r) { if (!r.ok) throw new Error("no api"); return r.json(); })
      .then(function (data) {
        S.data = data;
        S.demo = false;
        renderAll();
        window.VGH_DATA = data;
      })
      .catch(function () {
        // No server (static host like GitHub Pages): fall back to the
        // committed snapshot. The site becomes a read-only showcase.
        fetch("assets/content.snapshot.json")
          .then(function (r) { if (!r.ok) throw new Error("no snapshot"); return r.json(); })
          .then(function (data) {
            S.data = data;
            S.demo = true;
            renderAll();
            window.VGH_DATA = data;
            showToast("Demo preview — bookings need the live server.");
          })
          .catch(function () {
            $("#app").innerHTML =
              '<div class="boot-loading">Could not load site content. Please start the server with <code>node server.js</code> and open <a href="http://localhost:3000/">http://localhost:3000/</a>.</div>';
          });
      });
  });
})();