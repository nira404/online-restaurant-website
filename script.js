(function () {
  "use strict";

  var KEY = "runique_reservations";
  var KEY_MSG = "runique_messages";
  var KEY_INQ = "runique_inquiries";
  var KEY_NEWS = "runique_newsletter";
  var PHONE = "(043) 756 1234";
  var LOCATION =
    "Runique, Ground Floor, Summit Plaza, Pres. J.P. Laurel Highway, Lipa City, Batangas 4218";
  var SLOTS = ["17:30", "18:15", "19:00", "19:45", "20:30", "21:15"];
  var SEATING = {
    indoor: {
      label: "Indoor Dining Room",
      note: "Candlelit main room",
      capacity: 6,
      maxGuests: 6,
    },
    patio: {
      label: "Garden Patio",
      note: "Open-air, weather permitting",
      capacity: 4,
      maxGuests: 6,
    },
    counter: {
      label: "Chef's Counter",
      note: "Front row to the live fire",
      capacity: 2,
      maxGuests: 4,
    },
  };
  var OPEN_DAYS = [2, 3, 4, 5, 6];
  var WINDOW_DAYS = 30;
  var MIN_LEAD_MINUTES = 60;
  var CANCEL_HOURS = 24;
  var MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function $all(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }
  function pad(n) {
    return n < 10 ? "0" + n : "" + n;
  }
  function toISO(d) {
    return (
      d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate())
    );
  }
  function parseISO(s) {
    var p = s.split("-");
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function todayISO() {
    return toISO(new Date());
  }
  function addDaysISO(iso, n) {
    var d = parseISO(iso);
    d.setDate(d.getDate() + n);
    return toISO(d);
  }
  function isISO(s) {
    return /^\d{4}-\d{2}-\d{2}$/.test(s || "");
  }
  function formatDate(iso) {
    return parseISO(iso).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }
  function formatTime(t) {
    var p = t.split(":");
    var h = +p[0];
    return (
      (h % 12 === 0 ? 12 : h % 12) + ":" + p[1] + " " + (h >= 12 ? "PM" : "AM")
    );
  }
  function bookingDate(b) {
    var d = parseISO(b.date);
    var p = b.time.split(":");
    d.setHours(+p[0], +p[1], 0, 0);
    return d;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  }

  function loadAll(key) {
    try {
      var v = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(v) ? v : [];
    } catch (e) {
      return [];
    }
  }
  function saveAll(key, list) {
    try {
      localStorage.setItem(key, JSON.stringify(list));
      return true;
    } catch (e) {
      return false;
    }
  }

  function randomChars(n) {
    var alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    var buf = new Uint32Array(n);
    var out = "";
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(buf);
    } else {
      for (var i = 0; i < n; i++)
        buf[i] = Math.floor(Math.random() * 4294967295);
    }
    for (var j = 0; j < n; j++)
      out += alphabet.charAt(buf[j] % alphabet.length);
    return out;
  }
  function newRef(prefix, key) {
    var list = loadAll(key);
    var ref;
    do {
      ref = prefix + "-" + randomChars(6);
    } while (
      list.some(function (x) {
        return x.ref === ref;
      })
    );
    return ref;
  }
  function normalizeRef(v) {
    v = String(v || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");
    if (/^[A-Z0-9]{6}$/.test(v)) v = "RUN-" + v;
    return v;
  }
  function findBooking(ref) {
    var n = normalizeRef(ref);
    return (
      loadAll(KEY).filter(function (x) {
        return x.ref === n;
      })[0] || null
    );
  }
  function updateBooking(b) {
    var list = loadAll(KEY).map(function (x) {
      return x.ref === b.ref ? b : x;
    });
    return saveAll(KEY, list);
  }

  function validPhone(v) {
    var digits = v.replace(/\D/g, "");
    return (
      /^[0-9+()\-\s]+$/.test(v) && digits.length >= 7 && digits.length <= 15
    );
  }
  function setErr(el, msg) {
    var wrap = el.parentNode;
    var e = wrap.querySelector(":scope > .field-error");
    if (!e) {
      e = document.createElement("span");
      e.className = "field-error";
      wrap.appendChild(e);
    }
    e.textContent = msg || "";
    el.classList.toggle("is-invalid", !!msg);
  }
  function check(el, cond, msg) {
    setErr(el, cond ? "" : msg);
    return cond;
  }
  function showNotice(el, msg) {
    el.textContent = msg;
    el.classList.remove("d-none");
  }
  function hideNotice(el) {
    el.textContent = "";
    el.classList.add("d-none");
  }

  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function baseline(iso, time, seating) {
    var cap = SEATING[seating].capacity;
    var w =
      { 2: 0.25, 3: 0.3, 4: 0.45, 5: 0.7, 6: 0.8 }[parseISO(iso).getDay()] ||
      0.3;
    if (time === "19:00" || time === "19:45") w += 0.15;
    if (time === "17:30" || time === "21:15") w -= 0.15;
    var r = (hash(iso + "|" + time + "|" + seating) % 1000) / 1000;
    var f = Math.max(0, Math.min(1, w + (r - 0.5) * 0.7));
    return Math.round(f * cap);
  }
  function booked(iso, time, seating, excl) {
    return loadAll(KEY).filter(function (b) {
      return (
        b.status === "confirmed" &&
        b.date === iso &&
        b.time === time &&
        b.seating === seating &&
        b.ref !== excl
      );
    }).length;
  }
  function remaining(iso, time, seating, excl) {
    return Math.max(
      0,
      SEATING[seating].capacity -
        baseline(iso, time, seating) -
        booked(iso, time, seating, excl),
    );
  }
  function isOpen(iso) {
    return OPEN_DAYS.indexOf(parseISO(iso).getDay()) !== -1;
  }
  function inWindow(iso) {
    var t = todayISO();
    return iso >= t && iso <= addDaysISO(t, WINDOW_DAYS);
  }
  function slotInFuture(iso, time) {
    var t = todayISO();
    if (iso > t) return true;
    if (iso < t) return false;
    var p = time.split(":");
    var d = new Date();
    d.setHours(+p[0], +p[1], 0, 0);
    return d.getTime() - Date.now() >= MIN_LEAD_MINUTES * 60000;
  }
  function seatingOptions(iso, time, guests, excl) {
    var out = [];
    if (
      !iso ||
      !time ||
      !isOpen(iso) ||
      !inWindow(iso) ||
      !slotInFuture(iso, time)
    )
      return out;
    Object.keys(SEATING).forEach(function (k) {
      if (guests <= SEATING[k].maxGuests && remaining(iso, time, k, excl) > 0)
        out.push(k);
    });
    return out;
  }
  function dayStatus(iso, guests, excl) {
    if (!isOpen(iso) || !inWindow(iso)) return "closed";
    var total = 0;
    var left = 0;
    var anyFuture = false;
    SLOTS.forEach(function (s) {
      if (!slotInFuture(iso, s)) return;
      anyFuture = true;
      Object.keys(SEATING).forEach(function (k) {
        if (guests > SEATING[k].maxGuests) return;
        total += SEATING[k].capacity;
        left += remaining(iso, s, k, excl);
      });
    });
    if (!anyFuture) return "closed";
    if (left === 0) return "full";
    return left / total <= 0.3 ? "limited" : "open";
  }
  function firstAvailable(guests) {
    var t = todayISO();
    for (var i = 0; i <= WINDOW_DAYS; i++) {
      var iso = addDaysISO(t, i);
      var s = dayStatus(iso, guests);
      if (s === "open" || s === "limited") return iso;
    }
    return null;
  }

  function Calendar(root, opts) {
    var self = this;
    this.root = root;
    this.opts = opts;
    this.value = opts.value || null;
    var base = parseISO(this.value || opts.initial || todayISO());
    this.view = new Date(base.getFullYear(), base.getMonth(), 1);
    root.addEventListener("click", function (e) {
      var nav = e.target.closest("[data-cal-nav]");
      if (nav) {
        if (!nav.disabled) {
          self.view = new Date(
            self.view.getFullYear(),
            self.view.getMonth() + +nav.getAttribute("data-cal-nav"),
            1,
          );
          self.render();
        }
        return;
      }
      var day = e.target.closest("[data-date]");
      if (day && !day.disabled) {
        self.value = day.getAttribute("data-date");
        self.render();
        if (self.opts.onSelect) self.opts.onSelect(self.value);
      }
    });
    this.render();
  }
  Calendar.prototype.render = function () {
    var o = this.opts;
    var y = this.view.getFullYear();
    var m = this.view.getMonth();
    var idx = y * 12 + m;
    var minD = parseISO(o.min);
    var maxD = parseISO(o.max);
    var prevDis = idx <= minD.getFullYear() * 12 + minD.getMonth();
    var nextDis = idx >= maxD.getFullYear() * 12 + maxD.getMonth();
    var first = new Date(y, m, 1).getDay();
    var days = new Date(y, m + 1, 0).getDate();
    var today = todayISO();
    var html =
      '<div class="cal-head"><button type="button" class="cal-nav" data-cal-nav="-1" aria-label="Previous month"' +
      (prevDis ? " disabled" : "") +
      '>&#8249;</button><h4 class="cal-title">' +
      MONTHS[m] +
      " " +
      y +
      '</h4><button type="button" class="cal-nav" data-cal-nav="1" aria-label="Next month"' +
      (nextDis ? " disabled" : "") +
      '>&#8250;</button></div><div class="cal-grid">';
    ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].forEach(function (d) {
      html += '<div class="cal-dow">' + d + "</div>";
    });
    for (var i = 0; i < first; i++) html += "<span></span>";
    for (var d = 1; d <= days; d++) {
      var iso = y + "-" + pad(m + 1) + "-" + pad(d);
      var dis =
        iso < o.min || iso > o.max || (o.isDisabled && o.isDisabled(iso));
      var cls = "cal-day";
      if (dis) cls += " disabled";
      if (iso === this.value) cls += " selected";
      if (iso === today) cls += " today";
      if (!dis && o.statusClass) cls += " " + o.statusClass(iso);
      html +=
        '<button type="button" class="' +
        cls +
        '" data-date="' +
        iso +
        '"' +
        (dis ? " disabled" : "") +
        ' aria-label="' +
        formatDate(iso) +
        '">' +
        d +
        "</button>";
    }
    html += "</div>";
    this.root.innerHTML = html;
  };

  function renderSlots(root, o) {
    var html = '<div class="row g-2">';
    SLOTS.forEach(function (s) {
      var ok = o.date && seatingOptions(o.date, s, o.guests, o.excl).length > 0;
      var cls =
        "time-slot" +
        (s === o.value ? " active" : "") +
        (ok ? "" : " disabled");
      html +=
        '<div class="col-4"><button type="button" class="' +
        cls +
        '" data-time="' +
        s +
        '"' +
        (ok ? "" : ' disabled title="Unavailable"') +
        ">" +
        formatTime(s) +
        "</button></div>";
    });
    html += "</div>";
    if (!o.date)
      html += '<p class="slot-hint">Select a date to see available times.</p>';
    root.innerHTML = html;
    root.onclick = function (e) {
      var b = e.target.closest("[data-time]");
      if (b && !b.disabled) o.onPick(b.getAttribute("data-time"));
    };
  }

  function renderSeating(root, o) {
    var html = '<div class="row g-2">';
    Object.keys(SEATING).forEach(function (k) {
      var s = SEATING[k];
      var ready = o.date && o.time;
      var tooMany = o.guests > s.maxGuests;
      var left = ready && !tooMany ? remaining(o.date, o.time, k, o.excl) : 0;
      var ok = ready && !tooMany && left > 0;
      var meta;
      if (!ready) meta = "Choose a date and time first";
      else if (tooMany) meta = "Up to " + s.maxGuests + " guests";
      else if (left === 0) meta = "Fully booked";
      else meta = left <= 2 ? "Only " + left + " left" : "Available";
      html +=
        '<div class="col-md-4"><button type="button" class="seat-card' +
        (k === o.value ? " active" : "") +
        (ok ? "" : " disabled") +
        '" data-seat="' +
        k +
        '"' +
        (ok ? "" : " disabled") +
        '><span class="seat-title">' +
        s.label +
        '</span><span class="seat-note">' +
        s.note +
        '</span><span class="seat-meta">' +
        meta +
        "</span></button></div>";
    });
    html += "</div>";
    root.innerHTML = html;
    root.onclick = function (e) {
      var b = e.target.closest("[data-seat]");
      if (b && !b.disabled) o.onPick(b.getAttribute("data-seat"));
    };
  }

  function createPicker(cfg) {
    var st = {
      date: cfg.date || null,
      time: cfg.time || null,
      seating: cfg.seating || null,
      guests: cfg.guests || 2,
    };
    function g() {
      return Math.min(st.guests, 6);
    }
    var cal = new Calendar(cfg.calRoot, {
      min: todayISO(),
      max: addDaysISO(todayISO(), WINDOW_DAYS),
      value: st.date,
      isDisabled: function (iso) {
        var s = dayStatus(iso, g(), cfg.excl);
        return s === "closed" || s === "full";
      },
      onSelect: function (v) {
        st.date = v;
        sync();
      },
    });
    function sync() {
      if (st.date) {
        var ds = dayStatus(st.date, g(), cfg.excl);
        if (ds === "closed" || ds === "full") st.date = null;
      }
      if (
        st.date &&
        st.time &&
        seatingOptions(st.date, st.time, g(), cfg.excl).length === 0
      )
        st.time = null;
      if (!st.date || !st.time) {
        st.seating = null;
      } else {
        var opts = seatingOptions(st.date, st.time, g(), cfg.excl);
        if (st.seating && opts.indexOf(st.seating) === -1) st.seating = null;
        if (!st.seating && opts.length) st.seating = opts[0];
      }
      cal.value = st.date;
      cal.render();
      renderSlots(cfg.slotsRoot, {
        date: st.date,
        guests: g(),
        value: st.time,
        excl: cfg.excl,
        onPick: function (t) {
          st.time = t;
          sync();
        },
      });
      renderSeating(cfg.seatRoot, {
        date: st.date,
        time: st.time,
        guests: g(),
        value: st.seating,
        excl: cfg.excl,
        onPick: function (k) {
          st.seating = k;
          sync();
        },
      });
      if (cfg.onChange) cfg.onChange(st);
    }
    if (cfg.guestsEl) {
      cfg.guestsEl.addEventListener("change", function () {
        st.guests = cfg.guestsEl.value === "7+" ? 7 : +cfg.guestsEl.value;
        sync();
      });
    }
    sync();
    return { state: st, sync: sync };
  }

  function row(label, value) {
    return (
      '<div class="summary-row"><span>' +
      label +
      "</span><strong>" +
      value +
      "</strong></div>"
    );
  }
  function summaryHtml(b) {
    var h =
      row("Name", esc(b.name)) +
      row("Date", formatDate(b.date)) +
      row("Time", formatTime(b.time)) +
      row("Party size", b.guests + (b.guests === 1 ? " guest" : " guests")) +
      row(
        "Seating",
        esc(SEATING[b.seating] ? SEATING[b.seating].label : b.seating),
      );
    if (b.occasion && b.occasion !== "None")
      h += row("Occasion", esc(b.occasion));
    if (b.notes) h += row("Requests", esc(b.notes));
    h += row("Phone", esc(b.phone)) + row("Email", esc(b.email));
    return '<div class="summary-card">' + h + "</div>";
  }
  function guestOptions(selected, allowBig) {
    var h = "";
    for (var i = 1; i <= 6; i++)
      h +=
        '<option value="' +
        i +
        '"' +
        (i === selected ? " selected" : "") +
        ">" +
        i +
        (i === 1 ? " Guest" : " Guests") +
        "</option>";
    if (allowBig) h += '<option value="7+">7 or more (call us)</option>';
    return h;
  }

  function initReserve() {
    var form = $("#resForm");
    if (!form) return;
    var q = new URLSearchParams(window.location.search);
    var nameEl = $("#resName");
    var emailEl = $("#resEmail");
    var phoneEl = $("#resPhone");
    var guestsEl = $("#resGuests");
    var occEl = $("#resOccasion");
    var notesEl = $("#resNotes");
    var termsEl = $("#resTerms");
    var big = $("#bigParty");
    var formError = $("#formError");
    var summary = $("#resSummary");
    var submit = $("#resSubmit");
    var errDate = $("#errDate");
    var errTime = $("#errTime");
    var errSeating = $("#errSeating");
    var errTerms = $("#errTerms");

    nameEl.value = q.get("name") || "";
    emailEl.value = q.get("email") || "";
    phoneEl.value = q.get("phone") || "";
    var gq = q.get("guests");
    var startGuests = gq === "7+" ? 7 : /^[1-6]$/.test(gq || "") ? +gq : 2;
    guestsEl.value = startGuests === 7 ? "7+" : String(startGuests);

    var picker = createPicker({
      calRoot: $("#calendarRoot"),
      slotsRoot: $("#slotsRoot"),
      seatRoot: $("#seatingRoot"),
      guestsEl: guestsEl,
      guests: startGuests,
      date: isISO(q.get("date")) ? q.get("date") : null,
      time: SLOTS.indexOf(q.get("time")) !== -1 ? q.get("time") : null,
      onChange: function (st) {
        var isBig = st.guests > 6;
        big.classList.toggle("d-none", !isBig);
        submit.disabled = isBig;
        if (st.date) errDate.textContent = "";
        if (st.time) errTime.textContent = "";
        if (st.seating) errSeating.textContent = "";
        summary.innerHTML =
          row("Date", st.date ? formatDate(st.date) : "&mdash;") +
          row("Time", st.time ? formatTime(st.time) : "&mdash;") +
          row(
            "Guests",
            isBig
              ? "7 or more"
              : st.guests + (st.guests === 1 ? " guest" : " guests"),
          ) +
          row("Seating", st.seating ? SEATING[st.seating].label : "&mdash;");
      },
    });
    var st = picker.state;

    [nameEl, emailEl, phoneEl].forEach(function (el) {
      el.addEventListener("input", function () {
        setErr(el, "");
      });
    });
    termsEl.addEventListener("change", function () {
      errTerms.textContent = "";
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      hideNotice(formError);
      var ok = true;
      var firstBad = null;
      function fail(el) {
        ok = false;
        if (!firstBad) firstBad = el;
      }
      var name = nameEl.value.trim();
      var email = emailEl.value.trim();
      var phone = phoneEl.value.trim();
      if (!check(nameEl, name.length >= 2, "Please enter your full name."))
        fail(nameEl);
      if (
        !check(
          emailEl,
          EMAIL_RE.test(email),
          "Please enter a valid email address.",
        )
      )
        fail(emailEl);
      if (
        !check(phoneEl, validPhone(phone), "Please enter a valid phone number.")
      )
        fail(phoneEl);
      if (st.guests > 6) {
        fail(guestsEl);
        big.classList.remove("d-none");
      }
      if (!st.date) {
        errDate.textContent = "Please choose a date.";
        fail($("#calendarRoot"));
      }
      if (!st.time) {
        errTime.textContent = "Please choose a time.";
        fail($("#slotsRoot"));
      }
      if (!st.seating) {
        errSeating.textContent = "Please choose a seating area.";
        fail($("#seatingRoot"));
      }
      if (!termsEl.checked) {
        errTerms.textContent = "Please accept the terms to continue.";
        fail(termsEl);
      }
      if (!ok) {
        if (firstBad && firstBad.scrollIntoView)
          firstBad.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      if (
        seatingOptions(st.date, st.time, st.guests).indexOf(st.seating) === -1
      ) {
        showNotice(
          formError,
          "Sorry, that table is no longer available. Please choose another time or seating area.",
        );
        picker.sync();
        return;
      }
      var list = loadAll(KEY);
      var dup = list.some(function (b) {
        return (
          b.status === "confirmed" &&
          b.email.toLowerCase() === email.toLowerCase() &&
          b.date === st.date &&
          b.time === st.time
        );
      });
      if (dup) {
        showNotice(
          formError,
          "You already have a reservation with this email at that date and time. Use Manage Reservation to change it.",
        );
        return;
      }
      var booking = {
        ref: newRef("RUN", KEY),
        name: name,
        email: email,
        phone: phone,
        date: st.date,
        time: st.time,
        guests: st.guests,
        seating: st.seating,
        occasion: occEl.value,
        notes: notesEl.value.trim(),
        status: "confirmed",
        createdAt: new Date().toISOString(),
      };
      list.push(booking);
      if (!saveAll(KEY, list)) {
        showNotice(
          formError,
          "Your browser blocked local storage, so the reservation could not be saved. Please allow site storage and try again.",
        );
        return;
      }
      window.location.href =
        "booking-confirmation.html?ref=" + encodeURIComponent(booking.ref);
    });
  }

  function icsText(b) {
    var end = parseISO(b.date);
    var p = b.time.split(":");
    end.setHours(+p[0] + 2, +p[1], 0, 0);
    var stamp = new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Runique//Reservations//EN",
      "BEGIN:VEVENT",
      "UID:" + b.ref + "@runique.ph",
      "DTSTAMP:" + stamp,
      "DTSTART:" +
        b.date.replace(/-/g, "") +
        "T" +
        b.time.replace(":", "") +
        "00",
      "DTEND:" +
        toISO(end).replace(/-/g, "") +
        "T" +
        pad(end.getHours()) +
        pad(end.getMinutes()) +
        "00",
      "SUMMARY:Dinner at Runique",
      "LOCATION:" + LOCATION.replace(/,/g, "\\,"),
      "DESCRIPTION:Booking reference " +
        b.ref +
        " for " +
        b.guests +
        (b.guests === 1 ? " guest" : " guests") +
        ".",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
  }
  function downloadIcs(b) {
    var blob = new Blob([icsText(b)], { type: "text/calendar" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = b.ref + ".ics";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function initConfirmation() {
    var root = $("#confirmView");
    if (!root) return;
    var ref = new URLSearchParams(window.location.search).get("ref");
    var b = ref ? findBooking(ref) : null;
    if (!b) {
      root.innerHTML =
        '<div class="form-panel text-center"><p class="text-orange text-uppercase mb-2 eyebrow">Not found</p><h1 class="page-title mb-3">We could not find that booking</h1><p class="text-secondary mb-4">The reference is missing or the reservation was made on a different browser. You can look it up with your reference and email, or make a new booking.</p><div class="d-flex gap-2 justify-content-center flex-wrap"><a class="btn btn-orange" href="manage-reservation.html">Manage Reservation</a><a class="btn btn-outline-light" href="reserve.html">Reserve a Table</a></div></div>';
      return;
    }
    var cancelled = b.status === "cancelled";
    var first = esc(b.name.split(" ")[0]);
    root.innerHTML =
      '<div class="text-center mb-4"><div class="check-ring' +
      (cancelled ? " cancelled" : "") +
      '"><svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="' +
      (cancelled ? "M18 6L6 18M6 6l12 12" : "M20 6L9 17l-5-5") +
      '"></path></svg></div>' +
      '<p class="text-orange text-uppercase mb-2 eyebrow">' +
      (cancelled ? "Reservation cancelled" : "Reservation confirmed") +
      "</p>" +
      '<h1 class="page-title mb-3">Thank you, ' +
      first +
      ".</h1>" +
      '<p class="text-secondary mx-auto" style="max-width:520px;font-weight:300;line-height:1.7">' +
      (cancelled
        ? "This reservation has been cancelled. You are welcome to book another table any time."
        : "Your table is held. We look forward to welcoming you to Runique.") +
      "</p></div>" +
      '<div class="ref-box text-center mb-4"><p class="form-label mb-1">Booking reference</p><p class="ref-code mb-2" id="refCode">' +
      esc(b.ref) +
      '</p><p class="text-secondary small mb-3" style="font-weight:300">Keep this number and the email you used. You will need both to change or cancel your booking.</p><button type="button" class="btn btn-outline-light" id="copyRef">Copy Reference</button></div>' +
      summaryHtml(b) +
      '<div class="d-flex gap-2 justify-content-center flex-wrap mt-4 no-print">' +
      (cancelled
        ? '<a class="btn btn-orange" href="reserve.html">Book Again</a>'
        : '<button type="button" class="btn btn-orange" id="addCal">Add to Calendar</button><a class="btn btn-outline-light" href="manage-reservation.html?ref=' +
          encodeURIComponent(b.ref) +
          '">Manage Reservation</a>') +
      '<button type="button" class="btn btn-outline-light" id="printBtn">Print</button><a class="btn btn-outline-light" href="index.html">Back to Home</a></div>' +
      '<p class="text-secondary text-center small mt-4" style="font-weight:300">Free changes and cancellation up to 24 hours before your reservation. Questions? Call ' +
      PHONE +
      ".</p>";

    $("#copyRef").addEventListener("click", function () {
      var btn = this;
      function done() {
        btn.textContent = "Copied";
        setTimeout(function () {
          btn.textContent = "Copy Reference";
        }, 2000);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(b.ref).then(done, function () {});
      } else {
        var t = document.createElement("textarea");
        t.value = b.ref;
        document.body.appendChild(t);
        t.select();
        try {
          document.execCommand("copy");
          done();
        } catch (e) {}
        document.body.removeChild(t);
      }
    });
    $("#printBtn").addEventListener("click", function () {
      window.print();
    });
    var cal = $("#addCal");
    if (cal)
      cal.addEventListener("click", function () {
        downloadIcs(b);
      });
  }

  function canModify(b) {
    return (
      b.status === "confirmed" &&
      bookingDate(b).getTime() - Date.now() >= CANCEL_HOURS * 3600000
    );
  }

  function initManage() {
    var lookup = $("#lookupForm");
    if (!lookup) return;
    var refEl = $("#mgRef");
    var emailEl = $("#mgEmail");
    var lookupError = $("#lookupError");
    var view = $("#manageView");
    var modalEl = $("#cancelModal");
    var current = null;
    var q = new URLSearchParams(window.location.search);
    if (q.get("ref")) refEl.value = q.get("ref");

    function render(b, notice) {
      current = b;
      var past = bookingDate(b).getTime() < Date.now();
      var html = "";
      if (notice)
        html +=
          '<div class="notice ' +
          (notice.type || "") +
          ' mb-3">' +
          esc(notice.text) +
          "</div>";
      html +=
        '<div class="form-panel"><div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3"><div><p class="form-label mb-1">Booking reference</p><p class="ref-code ref-small mb-0">' +
        esc(b.ref) +
        '</p></div><span class="status-badge ' +
        b.status +
        '">' +
        (b.status === "confirmed" ? "Confirmed" : "Cancelled") +
        "</span></div>" +
        summaryHtml(b);
      if (b.status === "cancelled") {
        html +=
          '<div class="d-flex gap-2 flex-wrap mt-4"><a class="btn btn-orange" href="reserve.html">Book Again</a></div>';
      } else if (canModify(b)) {
        html +=
          '<div class="d-flex gap-2 flex-wrap mt-4"><button type="button" class="btn btn-orange" id="btnEdit">Change Reservation</button><button type="button" class="btn btn-outline-light" id="btnCancel">Cancel Reservation</button><a class="btn btn-outline-light" href="booking-confirmation.html?ref=' +
          encodeURIComponent(b.ref) +
          '">View Confirmation</a></div>';
      } else {
        html +=
          '<div class="notice mt-4 mb-0">' +
          (past
            ? "This reservation date has already passed."
            : "Changes and cancellations are available up to 24 hours before your reservation. Please call us on " +
              PHONE +
              " for help.") +
          "</div>";
      }
      html += '</div><div id="editHost"></div>';
      view.innerHTML = html;
      view.classList.remove("d-none");
      var edit = $("#btnEdit");
      var cancel = $("#btnCancel");
      if (edit) edit.addEventListener("click", openEdit);
      if (cancel)
        cancel.addEventListener("click", function () {
          $("#cancelSummary").textContent =
            formatDate(current.date) +
            " at " +
            formatTime(current.time) +
            " for " +
            current.guests +
            (current.guests === 1 ? " guest" : " guests");
          window.bootstrap.Modal.getOrCreateInstance(modalEl).show();
        });
    }

    function openEdit() {
      var b = current;
      var host = $("#editHost");
      host.innerHTML =
        '<div class="form-panel mt-3"><h3 class="step-title">Change your reservation</h3>' +
        '<div class="row g-2 mb-3"><div class="col-sm-6"><label class="form-label" for="editGuests">Guests</label><select id="editGuests" class="form-select">' +
        guestOptions(b.guests, false) +
        "</select></div></div>" +
        '<label class="form-label">Date</label><div id="editCal" class="calendar"></div>' +
        '<label class="form-label mt-3">Time</label><div id="editSlots"></div>' +
        '<label class="form-label mt-3">Seating</label><div id="editSeat"></div>' +
        '<div id="editError" class="notice error d-none mt-3"></div>' +
        '<div class="d-flex gap-2 flex-wrap mt-4"><button type="button" class="btn btn-orange" id="saveEdit">Save Changes</button><button type="button" class="btn btn-outline-light" id="discardEdit">Keep Original</button></div></div>';
      var picker = createPicker({
        calRoot: $("#editCal"),
        slotsRoot: $("#editSlots"),
        seatRoot: $("#editSeat"),
        guestsEl: $("#editGuests"),
        excl: b.ref,
        date: b.date,
        time: b.time,
        seating: b.seating,
        guests: b.guests,
      });
      host.scrollIntoView({ behavior: "smooth", block: "start" });
      $("#discardEdit").addEventListener("click", function () {
        host.innerHTML = "";
      });
      $("#saveEdit").addEventListener("click", function () {
        var s = picker.state;
        var err = $("#editError");
        hideNotice(err);
        if (!s.date || !s.time || !s.seating) {
          showNotice(err, "Please choose a date, time and seating area.");
          return;
        }
        if (
          s.date === b.date &&
          s.time === b.time &&
          s.seating === b.seating &&
          s.guests === b.guests
        ) {
          showNotice(err, "You have not changed anything yet.");
          return;
        }
        if (
          seatingOptions(s.date, s.time, s.guests, b.ref).indexOf(s.seating) ===
          -1
        ) {
          showNotice(
            err,
            "That table is no longer available. Please choose another option.",
          );
          picker.sync();
          return;
        }
        var clash = loadAll(KEY).some(function (x) {
          return (
            x.ref !== b.ref &&
            x.status === "confirmed" &&
            x.email.toLowerCase() === b.email.toLowerCase() &&
            x.date === s.date &&
            x.time === s.time
          );
        });
        if (clash) {
          showNotice(
            err,
            "You already have another reservation at that date and time.",
          );
          return;
        }
        var updated = Object.assign({}, b, {
          date: s.date,
          time: s.time,
          seating: s.seating,
          guests: s.guests,
          updatedAt: new Date().toISOString(),
        });
        if (!updateBooking(updated)) {
          showNotice(
            err,
            "Your browser blocked local storage, so the change could not be saved.",
          );
          return;
        }
        render(updated, {
          type: "success",
          text: "Your reservation has been updated.",
        });
        window.scrollTo({ top: view.offsetTop - 80, behavior: "smooth" });
      });
    }

    $("#confirmCancel").addEventListener("click", function () {
      if (!current) return;
      var updated = Object.assign({}, current, {
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
      });
      var ok = updateBooking(updated);
      window.bootstrap.Modal.getOrCreateInstance(modalEl).hide();
      render(
        updated,
        ok
          ? {
              type: "success",
              text: "Your reservation has been cancelled. Your table has been released.",
            }
          : {
              type: "error",
              text: "Your browser blocked local storage, so the cancellation could not be saved.",
            },
      );
    });

    lookup.addEventListener("submit", function (e) {
      e.preventDefault();
      hideNotice(lookupError);
      view.classList.add("d-none");
      var ref = refEl.value.trim();
      var email = emailEl.value.trim();
      var ok = check(
        refEl,
        ref.length > 0,
        "Please enter your booking reference.",
      );
      ok =
        check(
          emailEl,
          EMAIL_RE.test(email),
          "Please enter the email used for the booking.",
        ) && ok;
      if (!ok) return;
      var b = findBooking(ref);
      if (!b || b.email.toLowerCase() !== email.toLowerCase()) {
        showNotice(
          lookupError,
          "We could not find a reservation matching that reference and email on this browser. Please check both and try again.",
        );
        return;
      }
      render(b);
    });
    [refEl, emailEl].forEach(function (el) {
      el.addEventListener("input", function () {
        setErr(el, "");
      });
    });
  }

  function initAvailability() {
    var calRoot = $("#availCalendar");
    if (!calRoot) return;
    var guestsEl = $("#availGuests");
    var detail = $("#availDetail");
    var guests = 2;
    var selected = null;

    function showDay(iso) {
      selected = iso;
      var html =
        '<div class="form-panel"><p class="text-orange text-uppercase mb-1 eyebrow">' +
        formatDate(iso) +
        '</p><h3 class="step-title">Tables by time</h3><div class="table-responsive"><table class="table avail-table align-middle mb-0"><thead><tr><th>Time</th><th>Indoor</th><th>Patio</th><th>Counter</th><th></th></tr></thead><tbody>';
      SLOTS.forEach(function (s) {
        var future = slotInFuture(iso, s);
        var any = false;
        var cells = "";
        Object.keys(SEATING).forEach(function (k) {
          if (!future) {
            cells += '<td class="muted">&mdash;</td>';
            return;
          }
          if (guests > SEATING[k].maxGuests) {
            cells += '<td class="muted">n/a</td>';
            return;
          }
          var r = remaining(iso, s, k);
          if (r > 0) any = true;
          cells +=
            '<td class="' +
            (r === 0 ? "full" : r <= 2 ? "low" : "ok") +
            '">' +
            (r === 0 ? "Full" : r + " left") +
            "</td>";
        });
        html +=
          "<tr><td>" +
          formatTime(s) +
          "</td>" +
          cells +
          '<td class="text-end">' +
          (any
            ? '<a class="btn btn-orange" href="reserve.html?date=' +
              iso +
              "&time=" +
              s +
              "&guests=" +
              guests +
              '">Reserve</a>'
            : '<span class="muted">Unavailable</span>') +
          "</td></tr>";
      });
      html +=
        '</tbody></table></div><p class="text-secondary small mt-3 mb-0" style="font-weight:300">Showing tables for ' +
        guests +
        (guests === 1 ? " guest" : " guests") +
        ". Counter seats up to 4 guests.</p></div>";
      detail.innerHTML = html;
    }

    var cal = new Calendar(calRoot, {
      min: todayISO(),
      max: addDaysISO(todayISO(), WINDOW_DAYS),
      isDisabled: function (iso) {
        return dayStatus(iso, guests) === "closed";
      },
      statusClass: function (iso) {
        return "st-" + dayStatus(iso, guests);
      },
      onSelect: showDay,
    });
    guestsEl.addEventListener("change", function () {
      guests = +guestsEl.value;
      cal.render();
      if (selected) showDay(selected);
    });
    var qd = new URLSearchParams(window.location.search).get("date");
    if (isISO(qd) && dayStatus(qd, guests) !== "closed") {
      cal.setValue(qd);
      showDay(qd);
    }
  }
  Calendar.prototype.setValue = function (v) {
    this.value = v;
    var d = parseISO(v);
    this.view = new Date(d.getFullYear(), d.getMonth(), 1);
    this.render();
  };

  function initNewsletter() {
    var root = $("#newsView");
    if (!root) return;
    var email = (
      new URLSearchParams(window.location.search).get("email") || ""
    ).trim();
    if (!EMAIL_RE.test(email)) {
      root.innerHTML =
        '<p class="text-orange text-uppercase mb-2 eyebrow">Newsletter</p><h1 class="page-title mb-3">We need a valid email</h1><p class="text-secondary mb-4">That email address did not look right. Please go back and try again.</p><a class="btn btn-orange" href="index.html">Back to Home</a>';
      return;
    }
    var list = loadAll(KEY_NEWS);
    var exists = list.some(function (x) {
      return x.email.toLowerCase() === email.toLowerCase();
    });
    if (!exists) {
      list.push({ email: email, subscribedAt: new Date().toISOString() });
      saveAll(KEY_NEWS, list);
    }
    root.innerHTML =
      '<div class="check-ring mx-auto mb-4"><svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg></div><p class="text-orange text-uppercase mb-2 eyebrow">' +
      (exists ? "Already subscribed" : "Subscribed") +
      '</p><h1 class="page-title mb-3">' +
      (exists ? "You are already on the list" : "Welcome to the list") +
      '</h1><p class="text-secondary mx-auto mb-4" style="max-width:480px;font-weight:300;line-height:1.7">' +
      (exists
        ? "We already have "
        : "We will send tasting menu announcements and event invites to ") +
      "<strong>" +
      esc(email) +
      "</strong>" +
      (exists ? " on file." : ".") +
      '</p><div class="d-flex gap-2 justify-content-center flex-wrap"><a class="btn btn-orange" href="reserve.html">Reserve a Table</a><a class="btn btn-outline-light" href="index.html">Back to Home</a></div>';
  }

  function showSuccess(form, html) {
    form.classList.add("d-none");
    var box = document.createElement("div");
    box.className = "form-success text-center py-3";
    box.innerHTML =
      html +
      '<button type="button" class="btn btn-outline-light mt-3">Send Another</button>';
    form.parentNode.insertBefore(box, form.nextSibling);
    box.querySelector("button").addEventListener("click", function () {
      box.parentNode.removeChild(box);
      form.reset();
      $all(".is-invalid", form).forEach(function (el) {
        setErr(el, "");
      });
      form.classList.remove("d-none");
    });
  }
  function labelFields(form, names) {
    var fields = $all("input, select, textarea", form);
    fields.forEach(function (el, i) {
      var lab = el.parentNode.querySelector("label");
      el.name = names[i];
      el.id = "f_" + form.getAttribute("data-form") + "_" + names[i];
      if (lab) lab.setAttribute("for", el.id);
      el.addEventListener("input", function () {
        setErr(el, "");
      });
      el.addEventListener("change", function () {
        setErr(el, "");
      });
    });
    return fields;
  }

  function initContact() {
    var form = $('[data-form="contact"]');
    if (!form) return;
    var f = labelFields(form, ["name", "email", "message"]);
    form.noValidate = true;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = f[0].value.trim();
      var email = f[1].value.trim();
      var msg = f[2].value.trim();
      var ok = check(f[0], name.length >= 2, "Please enter your name.");
      ok =
        check(
          f[1],
          EMAIL_RE.test(email),
          "Please enter a valid email address.",
        ) && ok;
      ok =
        check(
          f[2],
          msg.length >= 10,
          "Please write a message of at least 10 characters.",
        ) && ok;
      if (!ok) return;
      var list = loadAll(KEY_MSG);
      var ref = newRef("MSG", KEY_MSG);
      list.push({
        ref: ref,
        name: name,
        email: email,
        message: msg,
        sentAt: new Date().toISOString(),
      });
      if (!saveAll(KEY_MSG, list)) {
        setErr(
          f[2],
          "Your browser blocked local storage, so the message could not be saved.",
        );
        return;
      }
      showSuccess(
        form,
        '<p class="text-orange text-uppercase mb-2 eyebrow">Message sent</p><h3 class="mb-2">Thank you, ' +
          esc(name.split(" ")[0]) +
          '.</h3><p class="text-secondary small mb-1" style="font-weight:300;line-height:1.6">We will reply to ' +
          esc(email) +
          ' soon.</p><p class="text-secondary small mb-0" style="font-weight:300">Reference <span class="font-monospace text-orange">' +
          ref +
          "</span></p>",
      );
    });
  }

  function initInquiry() {
    var form = $('[data-form="inquiry"]');
    if (!form) return;
    var f = labelFields(form, [
      "name",
      "email",
      "phone",
      "date",
      "guests",
      "type",
      "details",
    ]);
    form.noValidate = true;
    f[3].min = addDaysISO(todayISO(), 1);
    f[3].max = addDaysISO(todayISO(), 365);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = f[0].value.trim();
      var email = f[1].value.trim();
      var phone = f[2].value.trim();
      var date = f[3].value;
      var ok = check(f[0], name.length >= 2, "Please enter your full name.");
      ok =
        check(
          f[1],
          EMAIL_RE.test(email),
          "Please enter a valid email address.",
        ) && ok;
      ok =
        check(f[2], validPhone(phone), "Please enter a valid phone number.") &&
        ok;
      ok =
        check(
          f[3],
          isISO(date) && date >= f[3].min && date <= f[3].max,
          "Please choose a date within the next year.",
        ) && ok;
      if (!ok) return;
      var list = loadAll(KEY_INQ);
      var ref = newRef("EVT", KEY_INQ);
      list.push({
        ref: ref,
        name: name,
        email: email,
        phone: phone,
        date: date,
        guests: f[4].value,
        type: f[5].value,
        details: f[6].value.trim(),
        sentAt: new Date().toISOString(),
      });
      if (!saveAll(KEY_INQ, list)) {
        setErr(
          f[3],
          "Your browser blocked local storage, so the inquiry could not be saved.",
        );
        return;
      }
      showSuccess(
        form,
        '<p class="text-orange text-uppercase mb-2 eyebrow">Inquiry received</p><h3 class="mb-2">Thank you, ' +
          esc(name.split(" ")[0]) +
          '.</h3><p class="text-secondary small mb-1" style="font-weight:300;line-height:1.6">Our events coordinator will reach out within 24 hours about ' +
          esc(formatDate(date)) +
          '.</p><p class="text-secondary small mb-0" style="font-weight:300">Reference <span class="font-monospace text-orange">' +
          ref +
          "</span></p>",
      );
    });
  }

  function initQuickReserve() {
    var form = $("#quickReserve");
    if (!form) return;
    var dateEl = $("#qDate");
    var guestsEl = $("#qGuests");
    var slotsRoot = $("#qSlots");
    var timeEl = $("#qTime");
    var dateErr = $("#qDateErr");
    var bigEl = $("#qBig");
    var today = todayISO();
    dateEl.min = today;
    dateEl.max = addDaysISO(today, WINDOW_DAYS);

    function guestsNum() {
      return guestsEl.value === "7+" ? 7 : +guestsEl.value;
    }
    function dateValid() {
      var iso = dateEl.value;
      return isISO(iso) && isOpen(iso) && inWindow(iso);
    }
    function draw() {
      var iso = dateEl.value;
      var g = Math.min(guestsNum(), 6);
      var valid = dateValid();
      dateErr.textContent =
        iso && !valid
          ? isOpen(iso)
            ? "Tables release up to 30 days ahead."
            : "We are open Tuesday to Saturday."
          : "";
      if (
        timeEl.value &&
        (!valid || seatingOptions(iso, timeEl.value, g).length === 0)
      )
        timeEl.value = "";
      bigEl.classList.toggle("d-none", guestsNum() <= 6);
      renderSlots(slotsRoot, {
        date: valid ? iso : null,
        guests: g,
        value: timeEl.value,
        onPick: function (t) {
          timeEl.value = t;
          draw();
        },
      });
    }
    var first = firstAvailable(2);
    if (first) {
      dateEl.value = first;
      var preferred = ["19:00"].concat(SLOTS).filter(function (s) {
        return seatingOptions(first, s, 2).length > 0;
      })[0];
      if (preferred) timeEl.value = preferred;
    }
    dateEl.addEventListener("change", draw);
    guestsEl.addEventListener("change", draw);
    form.addEventListener("submit", function (e) {
      if (guestsNum() > 6) {
        e.preventDefault();
        bigEl.classList.remove("d-none");
        return;
      }
      if (!dateValid()) {
        e.preventDefault();
        dateErr.textContent = dateEl.value
          ? dateErr.textContent
          : "Please choose a date.";
        dateEl.focus();
      }
    });
    draw();
  }

  document.addEventListener("DOMContentLoaded", function () {
    initQuickReserve();
    initReserve();
    initConfirmation();
    initManage();
    initAvailability();
    initNewsletter();
    initContact();
    initInquiry();
  });
})();

document.addEventListener("DOMContentLoaded", () => {
  const timeSlots = document.querySelectorAll(".time-slot");

  timeSlots.forEach((slot) => {
    slot.addEventListener("click", function () {
      timeSlots.forEach((s) => s.classList.remove("active"));
      this.classList.add("active");
    });
  });
});
