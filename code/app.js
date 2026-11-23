const seedData = JSON.parse(document.querySelector("#seed-data").textContent);
const storageKey = "kvartal-frontend-v5";
const screens = Array.from(document.querySelectorAll(".screen"));
const siteHeader = document.querySelector("#site-header");
const siteFooter = document.querySelector("#site-footer");
const homeServiceTitle = document.querySelector("#home-service-title");
const pageNavTitle = document.querySelector("#page-nav-title");
const pageWordmark = document.querySelector("#page-wordmark");
const moderatorNav = document.querySelector("#moderator-nav");
const filtersDialog = document.querySelector("#filters-dialog");
const filtersForm = document.querySelector("#filters-form");
const reasonDialog = document.querySelector("#reason-dialog");
const reasonForm = document.querySelector("#reason-form");
const ratingDialog = document.querySelector("#seller-rating-dialog");
const ratingForm = document.querySelector("#seller-rating-form");
const closeListingDialog = document.querySelector("#close-listing-dialog");
const moderationGuideDialog = document.querySelector("#moderation-guide-dialog");
const noticeDialog = document.querySelector("#notice-dialog");
const propertyTemplate = document.querySelector("#listing-card-template");
const accountListingTemplate = document.querySelector("#account-listing-template");
const chatRowTemplate = document.querySelector("#chat-row-template");
const moderatorRowTemplate = document.querySelector("#moderator-row-template");
let lastPageHash = "#/home";
let listingReturnHash = "#/home";
let lastRenderedPage = null;
let wordmarkTimer = null;
let draftPhotos = [];
let registrationPhoto = "";
let closeListingId = null;
let ratingChatId = null;
const mapInstances = {};

const freshState = {
  user: null,
  favorites: [],
  listings: [],
  chats: [],
  moderatorChats: [],
  quiz: {},
  quizStep: 0,
  filters: { query: "", kind: "", rooms: "", district: "", orientation: "", minPrice: "", maxPrice: "", minArea: "", maxArea: "" },
  favoriteFilter: { sort: "default", kind: "", rooms: "", district: "", orientation: "", minPrice: "", maxPrice: "", minArea: "", maxArea: "" },
  searchSort: "match",
  filterContext: "search",
  reviewId: null,
  reasonDecision: "",
  pendingRoute: "#/profile"
};

function restoreState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    const restored = { ...JSON.parse(JSON.stringify(freshState)), ...(saved || {}) };
    restored.filters = { ...freshState.filters, ...(saved?.filters || {}) };
    restored.favoriteFilter = { ...freshState.favoriteFilter, ...(saved?.favoriteFilter || {}) };
    restored.user = null;
    restored.listings = [];
    restored.chats = [];
    restored.moderatorChats = [];
    return restored;
  } catch {
    return JSON.parse(JSON.stringify(freshState));
  }
}

let state = restoreState();

function saveState() {
  const data = {
    quiz: state.quiz,
    quizStep: state.quizStep,
    filters: state.filters,
    favoriteFilter: state.favoriteFilter,
    searchSort: state.searchSort
  };
  localStorage.setItem(storageKey, JSON.stringify(data));
}

function adaptUser(user) {
  if (!user) return null;
  const birthDate = user.birthDate || user.birth_date || "";
  return {
    id: Number(user.id || user.user_id),
    name: user.name || user.display_name,
    email: user.email,
    role: user.role,
    phone: user.phone || "",
    birthDate: String(birthDate).match(/^\d{4}-\d{2}-\d{2}/)?.[0] || "",
    photo: user.avatarPath || user.avatar_path || ""
  };
}

function adaptListing(item) {
  return {
    ...item,
    id: Number(item.id || item.listing_id),
    title: item.title,
    summary: item.description || item.summary || "",
    orientation: item.orientations?.[0] || item.orientation || "",
    orientations: item.orientations || (item.orientation ? [item.orientation] : []),
    ownerName: item.ownerName || "Собственник",
    ownerEmail: item.ownerEmail || "",
    ownerType: item.ownerType || "собственник",
    ownerRating: item.ownerRating === null || item.ownerRating === undefined ? null : Number(item.ownerRating),
    ownerReviewCount: Number(item.ownerReviewCount || 0),
    ownerResponseRate: item.ownerResponseRate === null || item.ownerResponseRate === undefined
      ? null
      : Number(item.ownerResponseRate),
    ratedByMe: Boolean(item.ratedByMe),
    views: Number(item.views || 0),
    saves: Number(item.saves || 0),
    moderationNote: item.moderationNote || "",
    photos: item.photos || []
  };
}

function mergeListings(listings) {
  const byId = new Map(state.listings.map((item) => [Number(item.id), item]));
  listings.map(adaptListing).forEach((item) => byId.set(Number(item.id), item));
  state.listings = Array.from(byId.values());
}

function renderListingsMap(elementId, listings) {
  if (!window.L) return;
  const element = document.getElementById(elementId);
  if (!element) return;

  const map = mapInstances[elementId] || window.L.map(element).setView([59.9343, 30.3351], 11);
  mapInstances[elementId] = map;
  map.attributionControl.setPrefix(false);
  map.eachLayer((layer) => {
    if (layer instanceof window.L.TileLayer || layer instanceof window.L.Marker) {
      map.removeLayer(layer);
    }
  });

  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>'
  }).addTo(map);

  const icon = window.L.divIcon({
    className: "kvartal-map-pin",
    html: "",
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
  const points = listings.filter((item) => item.latitude && item.longitude);
  points.forEach((item) => {
    window.L.marker([item.latitude, item.longitude], { icon })
      .addTo(map)
      .bindPopup(`<strong>${escapeHtml(propertyTitle(item))}</strong><br>${escapeHtml(item.address)}`);
  });

  if (points.length) {
    map.fitBounds(points.map((item) => [item.latitude, item.longitude]), { padding: [35, 35], maxZoom: 15 });
  } else {
    map.setView([59.9343, 30.3351], 11);
  }
  requestAnimationFrame(() => map.invalidateSize());
}

async function hydrateData() {
  const publicListings = await window.kvartalApi.listings({ limit: 100 });
  state.listings = publicListings.map(adaptListing);
  state.favorites = [];
  state.chats = [];
  state.moderatorChats = [];

  if (!window.kvartalApi.token()) {
    state.user = null;
    return;
  }

  try {
    state.user = adaptUser(await window.kvartalApi.me());
  } catch {
    state.user = null;
    return;
  }

  const [mine, favorites, chats] = await Promise.all([
    window.kvartalApi.myListings(),
    window.kvartalApi.favorites(),
    window.kvartalApi.chats()
  ]);
  mergeListings(mine);
  state.favorites = favorites.map((item) => Number(item.id));
  state.chats = chats.map((chat) => ({
    ...chat,
    messages: chat.lastMessage ? [{ text: chat.lastMessage, mine: false }] : []
  }));

  if (state.user.role === "moderator") {
    const moderation = await window.kvartalApi.moderationListings("pending");
    mergeListings(moderation);
  }
}

function currentChats() {
  return state.chats;
}

function syncSelect(select) {
  const wrapper = select.closest(".enhanced-select");
  if (!wrapper) return;
  const selectedOption = select.options[select.selectedIndex] || select.options[0];
  wrapper.querySelector(".enhanced-select-trigger span").textContent = selectedOption?.textContent || "";
  wrapper.querySelectorAll(".enhanced-select-menu button").forEach((button) => {
    button.classList.toggle("selected", button.dataset.value === select.value);
  });
}

function enhanceSelect(select) {
  if (select.dataset.enhanced === "true") return;

  const wrapper = document.createElement("div");
  wrapper.className = "enhanced-select";
  select.parentNode.insertBefore(wrapper, select);
  wrapper.appendChild(select);
  select.classList.add("native-select");
  select.dataset.enhanced = "true";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "enhanced-select-trigger";
  trigger.setAttribute("aria-expanded", "false");
  trigger.append(document.createElement("span"));

  const menu = document.createElement("div");
  menu.className = "enhanced-select-menu";

  Array.from(select.options).forEach((option) => {
    const item = document.createElement("button");
    item.type = "button";
    item.textContent = option.textContent;
    item.dataset.value = option.value;
    item.addEventListener("click", () => {
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      syncSelect(select);
      wrapper.classList.remove("open");
      trigger.setAttribute("aria-expanded", "false");
    });
    menu.appendChild(item);
  });

  trigger.addEventListener("click", () => {
    const willOpen = !wrapper.classList.contains("open");
    document.querySelectorAll(".enhanced-select.open").forEach((item) => item.classList.remove("open"));
    wrapper.classList.toggle("open", willOpen);
    trigger.setAttribute("aria-expanded", String(willOpen));
  });

  wrapper.append(trigger, menu);
  syncSelect(select);
}

function enhanceAllSelects(root = document) {
  root.querySelectorAll("select").forEach(enhanceSelect);
}

function syncAllSelects(root = document) {
  root.querySelectorAll("select").forEach(syncSelect);
}

function routeInfo() {
  const value = location.hash.replace(/^#\/?/, "");
  const [name, id = ""] = value.split("/");
  return { name: name || "home", id };
}

function isAuthRoute(name) {
  return ["login", "register"].includes(name);
}

function showScreen(name) {
  screens.forEach((screen) => {
    screen.hidden = screen.dataset.screen !== name;
  });
  document.body.classList.toggle("home-page", name === "home");
  siteHeader.hidden = false;
  siteFooter.hidden = false;
}

function openAuthOverlay(name) {
  const hasVisiblePage = screens.some(
    (screen) => !screen.classList.contains("auth-screen") && !screen.hidden
  );

  if (!hasVisiblePage) {
    screens.forEach((screen) => {
      if (!screen.classList.contains("auth-screen")) {
        screen.hidden = screen.dataset.screen !== "home";
      }
    });
  }

  screens.forEach((screen) => {
    if (screen.classList.contains("auth-screen")) {
      screen.hidden = screen.dataset.screen !== name;
    }
  });

  pageNavTitle.hidden = true;
  siteHeader.hidden = false;
  siteFooter.hidden = false;
}

function closeAuthOverlay() {
  document.querySelectorAll(".auth-screen").forEach((screen) => {
    screen.hidden = true;
  });
  window.location.hash = lastPageHash || "#/home";
}

function goAfterAuth(hash) {
  const target = hash || "#/profile";
  if (location.hash === target) {
    renderRoute();
  } else {
    location.hash = target;
  }
}

function updateHeader(route) {
  const activeRoute = route.name === "review" ? "moderator" : route.name;
  document.querySelectorAll(".main-nav a").forEach((link) => {
    link.classList.toggle("active", link.dataset.nav === activeRoute);
  });

  moderatorNav.hidden = state.user?.role !== "moderator";
  homeServiceTitle.hidden = route.name !== "home";

  const currentScreen = document.querySelector(`.screen[data-screen="${route.name}"]`);
  const pageTitle = currentScreen?.querySelector(".page-category");
  pageNavTitle.textContent = route.name === "home" ? "" : pageTitle?.textContent.trim() || "";
  pageNavTitle.hidden = route.name === "home" || !pageTitle;
}

async function logout() {
  await window.kvartalApi.logout();
  state.user = null;
  state.pendingRoute = "#/profile";
  await hydrateData();
  location.hash = "#/home";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatPrice(value) {
  return `${new Intl.NumberFormat("ru-RU").format(Number(value))} ₽`;
}

function normalizePriceInput(value) {
  const text = String(value || "").trim().toLowerCase().replace(/\s+/g, "");
  if (!text) return "";

  const millionMatch = text.match(/^(\d+(?:[.,]\d+)?)млн\.?₽?$/);
  if (millionMatch) {
    return String(Math.round(Number(millionMatch[1].replace(",", ".")) * 1_000_000));
  }

  return text.replace(/\D/g, "");
}

function propertyTitle(listing) {
  return listing.rooms === 0 ? "Студия" : `${listing.rooms}-комнатная квартира`;
}

function statusText(status) {
  return {
    pending: "на проверке",
    published: "опубликовано",
    needs_fix: "требует исправлений",
    rejected: "отклонено",
    closed: "закрыто · покупатель найден"
  }[status] || status;
}

function sellerRatingText(listing) {
  const parts = [];
  if (listing.ownerRating !== null) {
    parts.push(`рейтинг ${listing.ownerRating.toFixed(1)} из 5`);
    parts.push(`${listing.ownerReviewCount} оценок`);
  } else {
    parts.push("рейтинг пока не сформирован");
  }
  if (listing.ownerResponseRate !== null) {
    parts.push(`ответы в чате ${listing.ownerResponseRate}% за 24 ч`);
  }
  return parts.join(" · ");
}

function getListing(id) {
  return state.listings.find((listing) => listing.id === Number(id));
}

function scoreListing(listing) {
  const quiz = state.quiz;
  const checks = [
    [Boolean(quiz.kind && quiz.kind !== "any"), listing.kind === quiz.kind, 20],
    [Boolean(quiz.rooms && quiz.rooms !== "any"), quiz.rooms === "3" ? listing.rooms >= 3 : String(listing.rooms) === quiz.rooms, 22],
    [Boolean(quiz.budget), listing.price <= Number(quiz.budget), 18],
    [Boolean(quiz.district && quiz.district !== "any"), listing.district === quiz.district, 18],
    [Boolean(quiz.priority), listing.near.includes(quiz.priority), 12],
    [Boolean(quiz.orientation && quiz.orientation !== "any"), listing.orientation === quiz.orientation, 10]
  ];
  const active = checks.filter(([enabled]) => enabled);
  if (!active.length) return 72;
  const total = active.reduce((sum, [, , weight]) => sum + weight, 0);
  const matched = active.reduce((sum, [enabled, matches, weight]) => sum + (enabled && matches ? weight : 0), 0);
  return Math.max(48, Math.round((matched / total) * 100));
}

function createPropertyCard(listing, score) {
  const node = propertyTemplate.content.firstElementChild.cloneNode(true);
  node.querySelectorAll(".listing-link").forEach((link) => {
    link.href = `#/listing/${listing.id}`;
  });
  const image = node.querySelector(".property-image");
  image.src = listing.photos[0];
  image.alt = `${propertyTitle(listing)}, ${listing.address}`;
  node.querySelector(".property-info h3").textContent = propertyTitle(listing);
  node.querySelector(".property-price").textContent = formatPrice(listing.price);
  node.querySelector(".property-specs").textContent = `${listing.area} м² · ${listing.floor}/${listing.totalFloors} этаж`;
  node.querySelector(".property-location").textContent = `${listing.orientation} · ${listing.district} район`;
  const favorite = node.querySelector(".favorite-button");
  favorite.dataset.listingId = listing.id;
  favorite.classList.toggle("active", state.favorites.includes(listing.id));
  favorite.setAttribute("aria-label", state.favorites.includes(listing.id) ? "Убрать из избранного" : "Добавить в избранное");

  if (score) {
    const badge = node.querySelector(".match-badge");
    badge.hidden = false;
    badge.textContent = `${score}% соответствие`;
  }
  return node;
}

function renderHome() {
  const cards = state.listings
    .filter((listing) => listing.status === "published")
    .map((listing) => ({ listing, score: scoreListing(listing) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const container = document.querySelector("#home-properties");
  container.replaceChildren(...cards.map(({ listing, score }) => createPropertyCard(listing, score)));
  document.querySelector("#home-empty").hidden = cards.length > 0;
}

function renderQuiz() {
  const steps = Array.from(document.querySelectorAll(".quiz-step"));
  const quizKeys = ["kind", "rooms", "budget", "district", "priority", "orientation"];
  steps.forEach((step, index) => {
    step.hidden = state.quizStep !== index;
  });

  document.querySelector("#quiz-complete").hidden = state.quizStep < steps.length;
  document.querySelector("#quiz-back").hidden = state.quizStep === 0 || state.quizStep >= steps.length;
  document.querySelector("#quiz-next").hidden = state.quizStep >= steps.length;
  document.querySelector("#quiz-progress").textContent = state.quizStep >= steps.length ? "Готово" : `${state.quizStep + 1} из ${steps.length}`;
  document.querySelector("#quiz-progress-bar").style.width = `${Math.min((state.quizStep + 1) / steps.length, 1) * 100}%`;

  steps.forEach((step, index) => {
    const key = quizKeys[index];
    step.querySelectorAll("input").forEach((input) => {
      input.checked = state.quiz[key] === input.value;
    });
  });

  const currentKey = quizKeys[state.quizStep];
  document.querySelector("#quiz-next").disabled = Boolean(currentKey && !state.quiz[currentKey]);
}

function filteredListings(filters) {
  let result = state.listings.filter((listing) => listing.status === "published");
  const query = filters.query.trim().toLowerCase();

  if (query) {
    result = result.filter((listing) =>
      [propertyTitle(listing), listing.address, listing.district, listing.summary]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }

  if (filters.kind) result = result.filter((listing) => listing.kind === filters.kind);
  if (filters.rooms) {
    result = result.filter((listing) =>
      filters.rooms === "3" ? listing.rooms >= 3 : String(listing.rooms) === filters.rooms
    );
  }
  if (filters.district) result = result.filter((listing) => listing.district === filters.district);
  if (filters.orientation) result = result.filter((listing) => listing.orientation === filters.orientation);
  if (filters.minPrice) result = result.filter((listing) => listing.price >= Number(filters.minPrice));
  if (filters.maxPrice) result = result.filter((listing) => listing.price <= Number(filters.maxPrice));
  if (filters.minArea) result = result.filter((listing) => listing.area >= Number(filters.minArea));
  if (filters.maxArea) result = result.filter((listing) => listing.area <= Number(filters.maxArea));

  if (state.searchSort === "priceAsc") result.sort((a, b) => a.price - b.price);
  if (state.searchSort === "priceDesc") result.sort((a, b) => b.price - a.price);
  if (state.searchSort === "areaDesc") result.sort((a, b) => b.area - a.area);
  if (state.searchSort === "match") result.sort((a, b) => scoreListing(b) - scoreListing(a));

  return result;
}

function renderFilterChips() {
  const filters = state.filters;
  const labels = [];
  if (filters.kind) labels.push(filters.kind === "new" ? "Новостройка" : "Вторичка");
  if (filters.rooms) labels.push(filters.rooms === "0" ? "Студия" : `${filters.rooms} комнаты`);
  if (filters.district) labels.push(filters.district);
  if (filters.orientation) labels.push(filters.orientation);
  if (filters.minPrice) labels.push(`от ${formatPrice(filters.minPrice)}`);
  if (filters.maxPrice) labels.push(`до ${formatPrice(filters.maxPrice)}`);
  if (filters.minArea) labels.push(`от ${filters.minArea} м²`);
  if (filters.maxArea) labels.push(`до ${filters.maxArea} м²`);

  document.querySelector("#active-filters").innerHTML = labels.length
    ? labels.map((label, index) => `<span class="filter-chip ${index === 0 ? "active" : ""}">${escapeHtml(label)}</span>`).join("")
    : `<span class="filter-chip">Не выбраны</span>`;
}

function renderSearch() {
  const listings = filteredListings(state.filters);
  document.querySelector("#search-result-count").textContent = `Найдено ${listings.length} объявлений`;
  document.querySelector("#search-empty").hidden = listings.length > 0;
  document.querySelector("#search-results").replaceChildren(...listings.map((listing) => createPropertyCard(listing, 0)));
  document.querySelector("#search-form [name='query']").value = state.filters.query;
  document.querySelector("#search-form [name='sort']").value = state.searchSort;
  syncAllSelects(document.querySelector("#search-form"));
  renderFilterChips();
  renderListingsMap("search-map", listings);
}

function renderFavorites() {
  const filters = state.favoriteFilter;
  let listings = state.listings.filter(
    (listing) => state.favorites.includes(listing.id) && listing.status === "published"
  );

  if (filters.kind) listings = listings.filter((listing) => listing.kind === filters.kind);
  if (filters.rooms) {
    listings = listings.filter((listing) =>
      filters.rooms === "3" ? listing.rooms >= 3 : String(listing.rooms) === filters.rooms
    );
  }
  if (filters.district) listings = listings.filter((listing) => listing.district === filters.district);
  if (filters.orientation) listings = listings.filter((listing) => listing.orientation === filters.orientation);
  if (filters.minPrice) listings = listings.filter((listing) => listing.price >= Number(filters.minPrice));
  if (filters.maxPrice) listings = listings.filter((listing) => listing.price <= Number(filters.maxPrice));
  if (filters.minArea) listings = listings.filter((listing) => listing.area >= Number(filters.minArea));
  if (filters.maxArea) listings = listings.filter((listing) => listing.area <= Number(filters.maxArea));

  if (filters.sort === "priceAsc") listings.sort((a, b) => a.price - b.price);
  if (filters.sort === "priceDesc") listings.sort((a, b) => b.price - a.price);
  if (filters.sort === "areaDesc") listings.sort((a, b) => b.area - a.area);

  document.querySelector("#favorites-count").textContent = `Найдено ${listings.length} объявлений`;
  document.querySelector("#favorites-empty").hidden = listings.length > 0;
  document.querySelector("#favorite-results").replaceChildren(...listings.map((listing) => createPropertyCard(listing, 0)));
  const favoriteForm = document.querySelector("#favorites-filter-form");
  favoriteForm.elements.minPrice.value = filters.minPrice ? new Intl.NumberFormat("ru-RU").format(Number(filters.minPrice)) : "";
  favoriteForm.elements.maxPrice.value = filters.maxPrice ? new Intl.NumberFormat("ru-RU").format(Number(filters.maxPrice)) : "";
  favoriteForm.elements.minArea.value = filters.minArea;
  favoriteForm.elements.maxArea.value = filters.maxArea;

  document.querySelectorAll("[data-favorite-sort]").forEach((button) => {
    button.classList.toggle("active", button.dataset.favoriteSort === filters.sort);
  });
  renderListingsMap("favorites-map", listings);
}

function renderListing(id) {
  const listing = getListing(id);
  if (!listing) {
    location.hash = "#/search";
    return;
  }

  document.querySelector("#detail-photo-main").src = listing.photos[0];
  document.querySelector("#detail-photo-two").src = listing.photos[1];
  document.querySelector("#detail-photo-three").src = listing.photos[2];
  document.querySelector("#detail-photo-four").src = listing.photos[0];
  document.querySelector("#detail-location").textContent = `${listing.district} район · Санкт-Петербург`;
  document.querySelector("#detail-address").textContent = listing.address;
  document.querySelector("#detail-price").textContent = formatPrice(listing.price);
  document.querySelector("#detail-specs").innerHTML = `
    <span>${listing.rooms === 0 ? "Студия" : `${listing.rooms} комнаты`}</span>
    <span>${listing.area} м²</span>
    <span>${listing.floor}/${listing.totalFloors} этаж</span>
    <span>${escapeHtml(listing.orientation)}</span>
    <span>${listing.parking ? "Есть парковка" : "Без парковки"}</span>
  `;
  document.querySelector("#detail-seller").textContent =
    `${listing.ownerName} · ${listing.ownerType} · ${sellerRatingText(listing)}`;
  document.querySelector("#detail-seller-avatar").textContent = listing.ownerName[0];
  document.querySelector("#detail-summary").textContent = listing.summary;

  const favorite = document.querySelector("#detail-favorite");
  const active = state.favorites.includes(listing.id);
  favorite.dataset.listingId = listing.id;
  favorite.classList.toggle("active", active);
  favorite.lastChild.textContent = active ? " В избранном" : " В избранное";

  const messageButton = document.querySelector("#detail-message");
  messageButton.dataset.listingId = listing.id;
  messageButton.hidden = state.user?.email === listing.ownerEmail;

  const returnRoute = listingReturnHash.replace(/^#\/?/, "").split("/")[0] || "home";
  const returnLabels = {
    home: "На главную",
    search: "К поиску",
    favorites: "В избранное",
    messages: "К сообщениям",
    chat: "К переписке",
    profile: "В личный кабинет"
  };
  const backLink = document.querySelector("#listing-back-link");
  backLink.href = listingReturnHash;
  backLink.textContent = `← ${returnLabels[returnRoute] || "Назад"}`;
}

function renderAccountListing(listing) {
  const node = accountListingTemplate.content.firstElementChild.cloneNode(true);
  const link = node.querySelector(".account-listing-photo");
  link.href = `#/listing/${listing.id}`;
  const image = link.querySelector("img");
  image.src = listing.photos[0];
  image.alt = propertyTitle(listing);

  node.querySelector("h3").textContent = propertyTitle(listing);
  node.querySelector(".account-listing-meta").textContent = `${formatPrice(listing.price)} · ${listing.area} м² · ${listing.floor}/${listing.totalFloors} этаж`;
  node.querySelector(".account-listing-note").textContent = listing.moderationNote || `${listing.district} район · ${listing.address}`;

  const badge = node.querySelector(".status-badge");
  badge.textContent = statusText(listing.status);
  badge.classList.add(`status-${listing.status}`);

  node.querySelector(".views-line").textContent = `Просмотры: ${listing.views}`;
  node.querySelector(".saves-line").textContent = `В избранном: ${listing.saves}`;
  const closeButton = node.querySelector(".close-listing-button");
  closeButton.hidden = listing.status !== "published";
  closeButton.dataset.closeListing = listing.id;
  return node;
}

function renderProfile() {
  const user = state.user;
  document.querySelector("#profile-page-title").textContent = "Личный кабинет";
  document.querySelector("#profile-user-section").hidden = false;
  document.querySelector("#profile-user-listings").hidden = false;
  document.querySelector("#profile-moderator-section").hidden = true;

  const profileImage = document.querySelector("#profile-photo-image");
  const profileInitial = document.querySelector("#profile-initial");
  if (user.photo) {
    profileImage.classList.remove("image-error");
    profileImage.src = user.photo;
    profileImage.hidden = false;
    profileInitial.hidden = true;
  } else {
    profileImage.removeAttribute("src");
    profileImage.hidden = true;
    profileInitial.hidden = false;
    profileInitial.textContent = user.name[0];
  }
  document.querySelector("#profile-name").value = user.name;
  document.querySelector("#profile-email").value = user.email;
  document.querySelector("#profile-birth-date").value = user.birthDate || "";

  const own = state.listings.filter((listing) => listing.ownerEmail === user.email);
  document.querySelector("#profile-total").textContent = own.length;
  document.querySelector("#profile-active").textContent = own.filter((listing) => listing.status === "published").length;
  document.querySelector("#profile-pending").textContent = own.filter((listing) => listing.status === "pending").length;
  document.querySelector("#profile-listings").replaceChildren(...own.map(renderAccountListing));
}

function fillPublishForm(listing) {
  const form = document.querySelector("#publish-form");
  form.dataset.listingId = listing?.id || "";
  form.reset();
  syncAllSelects(form);
  document.querySelector("#sun-side-result").hidden = true;
  document.querySelector("#sun-side-status").hidden = true;
  draftPhotos = listing?.photos ? [...listing.photos.slice(0, 3)] : [];

  if (!listing) {
    ["#publish-photo-one", "#publish-photo-two", "#publish-photo-three"].forEach((selector) => {
      const image = document.querySelector(selector);
      image.removeAttribute("src");
      image.hidden = true;
    });
    renderPublishPreview();
    return;
  }

  form.elements.kind.value = listing.kind;
  const rooms = Array.from(form.elements.rooms).find((input) => input.value === String(listing.rooms));
  if (rooms) rooms.checked = true;
  form.elements.price.value = listing.price;
  form.elements.area.value = listing.area;
  form.elements.floor.value = listing.floor;
  form.elements.totalFloors.value = listing.totalFloors;
  form.elements.parking.value = String(listing.parking);
  form.elements.district.value = listing.district;
  form.elements.address.value = listing.address;
  form.elements.summary.value = listing.summary;
  syncAllSelects(form);

  const sunTime = {
    "Север": "none",
    "Восток": "morning",
    "Юг": "day",
    "Запад": "evening"
  }[listing.orientation];
  if (sunTime) {
    const option = Array.from(form.elements.sunTime).find((input) => input.value === sunTime);
    if (option) option.checked = true;
    document.querySelector("#sun-side-value").textContent = listing.orientation;
    document.querySelector("#sun-side-result").hidden = false;
  }

  ["#publish-photo-one", "#publish-photo-two", "#publish-photo-three"].forEach((selector, index) => {
    const image = document.querySelector(selector);
    if (listing.photos[index]) {
      image.classList.remove("image-error");
      image.src = listing.photos[index];
      image.hidden = false;
    } else {
      image.removeAttribute("src");
      image.hidden = true;
    }
  });
  renderPublishPreview();
}

function renderPublishPreview() {
  const form = document.querySelector("#publish-form");
  const rooms = Number(form.elements.rooms.value);
  const price = Number(form.elements.price.value);
  const area = Number(form.elements.area.value);
  const floor = Number(form.elements.floor.value);
  const totalFloors = Number(form.elements.totalFloors.value);
  const district = String(form.elements.district.value || "");
  const address = String(form.elements.address.value || "").trim();
  const description = String(form.elements.summary.value || "").trim();
  const photo = draftPhotos.find(Boolean);

  const photoElement = document.querySelector("#publish-preview-photo");
  const photoEmpty = document.querySelector("#publish-preview-photo-empty");
  if (photo) {
    photoElement.classList.remove("image-error");
    photoElement.src = photo;
    photoElement.hidden = false;
    photoEmpty.hidden = true;
  } else {
    photoElement.removeAttribute("src");
    photoElement.hidden = true;
    photoEmpty.hidden = false;
  }

  document.querySelector("#publish-preview-title").textContent =
    rooms === 0 ? "Студия" : `${rooms}-комнатная квартира`;
  document.querySelector("#publish-preview-price").textContent =
    price > 0 ? formatPrice(price) : "Цена не указана";
  document.querySelector("#publish-preview-specs").textContent =
    [area > 0 ? `${area} м²` : "", floor > 0 && totalFloors > 0 ? `${floor}/${totalFloors} этаж` : ""]
      .filter(Boolean)
      .join(" · ") || "Площадь и этаж";
  document.querySelector("#publish-preview-location").textContent =
    [district ? `${district} район` : "", address].filter(Boolean).join(" · ") || "Адрес не указан";
  document.querySelector("#publish-preview-description").textContent =
    description || "Описание появится здесь.";
}

function renderMessages() {
  const container = document.querySelector("#chat-list");
  const chats = currentChats();
  const visibleChats = chats.filter((chat) => getListing(chat.listingId));
  const rows = visibleChats.map((chat) => {
    const listing = getListing(chat.listingId);
    const node = chatRowTemplate.content.firstElementChild.cloneNode(true);
    node.href = `#/chat/${chat.id}`;
    node.querySelector(".avatar").textContent = chat.person[0];
    node.querySelector("strong").textContent = chat.person;
    node.querySelector(".chat-property").textContent = `${propertyTitle(listing)} · ${listing.district} район`;
    node.querySelector(".chat-last").textContent = chat.messages.at(-1)?.text || "";
    node.querySelector(".chat-time").textContent = chat.updatedAt;
    const unread = node.querySelector(".chat-unread");
    unread.hidden = !chat.unread;
    unread.textContent = chat.unread;
    return node;
  });
  container.replaceChildren(...rows);
  document.querySelector("#messages-count").textContent = `${visibleChats.length} диалога`;
  document.querySelector("#messages-empty").hidden = visibleChats.length > 0;
}

async function renderChat(chatId) {
  const chat = currentChats().find((item) => item.id === chatId);
  if (!chat) {
    location.hash = "#/messages";
    return;
  }

  let listing = getListing(chat.listingId);
  if (!listing) {
    listing = adaptListing(await window.kvartalApi.listing(chat.listingId));
    mergeListings([listing]);
  }
  const messages = await window.kvartalApi.messages(chat.id);
  chat.messages = messages.map((message) => ({ ...message, text: message.body }));
  chat.unread = 0;

  document.querySelector("#chat-open-listing").href = `#/listing/${listing.id}`;
  document.querySelector("#chat-person").textContent = chat.person;
  document.querySelector("#chat-listing-line").textContent = `${propertyTitle(listing)} · ${formatPrice(listing.price)}`;
  const ratingButton = document.querySelector("#chat-rate-seller");
  ratingButton.hidden = !chat.canRate;
  ratingButton.dataset.chatId = chat.id;
  ratingButton.textContent = chat.ratedByMe ? "Изменить оценку" : "Оценить продавца";

  document.querySelector("#chat-messages").innerHTML = chat.messages
    .map((message) => `<div class="message-bubble ${message.mine ? "outgoing" : "incoming"}">${escapeHtml(message.text)}</div>`)
    .join("");

  document.querySelector("#chat-form").dataset.chatId = chat.id;
}

function renderModerator() {
  const pending = state.listings.filter((listing) => listing.status === "pending");
  const today = new Date().toISOString().slice(0, 10);
  const approvedToday = state.listings.filter((listing) => listing.status === "published" && listing.publishedAt === today);

  document.querySelector("#moderator-queue-count").textContent = pending.length;
  document.querySelector("#moderator-new-count").textContent = pending.filter((listing) => !listing.reviewedAt).length;
  document.querySelector("#moderator-approved-count").textContent = approvedToday.length;
  document.querySelector("#moderator-empty").hidden = pending.length > 0;

  const rows = pending.map((listing) => {
    const node = moderatorRowTemplate.content.firstElementChild.cloneNode(true);
    const image = node.querySelector("img");
    image.src = listing.photos[0];
    image.alt = propertyTitle(listing);
    node.querySelector("h3").textContent = propertyTitle(listing);
    node.querySelector(".moderator-price").textContent = formatPrice(listing.price);
    node.querySelector(".moderator-specs").textContent = `${listing.area} м² · ${listing.floor}/${listing.totalFloors} этаж · ${listing.orientation} · ${listing.district} район`;
    node.querySelector(".button").href = `#/review/${listing.id}`;
    return node;
  });
  document.querySelector("#moderator-queue").replaceChildren(...rows);
}

function renderReview(id) {
  const listing = getListing(id);
  if (!listing) {
    location.hash = "#/moderator";
    return;
  }
  state.reviewId = listing.id;

  document.querySelector("#review-photo-one").src = listing.photos[0];
  document.querySelector("#review-photo-two").src = listing.photos[1];
  document.querySelector("#review-photo-three").src = listing.photos[2];
  document.querySelector("#review-photo-four").src = listing.photos[0];
  document.querySelector("#review-location").textContent = `${listing.district} район · Санкт-Петербург`;
  document.querySelector("#review-address").textContent = listing.address;
  document.querySelector("#review-price").textContent = formatPrice(listing.price);
  document.querySelector("#review-specs").textContent = `${listing.rooms === 0 ? "Студия" : `${listing.rooms} комнаты`} · ${listing.area} м² · ${listing.floor}/${listing.totalFloors} этаж · ${listing.orientation}`;
  document.querySelector("#review-seller").textContent =
    `${listing.ownerName} · ${listing.ownerType} · ${sellerRatingText(listing)}`;
  document.querySelector("#review-summary").textContent = listing.summary;
}

async function renderRoute() {
  const route = routeInfo();
  const protectedRoutes = ["favorites", "messages", "chat", "profile", "publish", "moderator", "review"];

  if (route.name === "moderator-login") {
    location.hash = "#/login";
    return;
  }

  if (!isAuthRoute(route.name) && route.name !== "listing") {
    listingReturnHash = location.hash || "#/home";
  }

  if (protectedRoutes.includes(route.name) && !state.user) {
    state.pendingRoute = location.hash || "#/profile";
    openAuthOverlay("login");
    return;
  }

  if ((route.name === "moderator" || route.name === "review") && state.user.role !== "moderator") {
    state.pendingRoute = location.hash;
    openAuthOverlay("login");
    return;
  }

  if (isAuthRoute(route.name)) {
    openAuthOverlay(route.name);
    return;
  }

  updateHeader(route);
  showScreen(route.name);
  lastPageHash = location.hash || "#/home";

  if (route.name === "home") {
    state.listings = (await window.kvartalApi.listings({ limit: 100, sort: "newest" })).map(adaptListing);
    renderQuiz();
    renderHome();
  }

  if (route.name === "search") {
    state.listings = (await window.kvartalApi.listings({ limit: 100, sort: "newest" })).map(adaptListing);
    renderSearch();
  }
  if (route.name === "favorites") {
    const favorites = await window.kvartalApi.favorites();
    mergeListings(favorites);
    state.favorites = favorites.map((item) => Number(item.id));
    renderFavorites();
  }

  if (route.name === "listing") {
    if (!getListing(route.id)) {
      mergeListings([await window.kvartalApi.listing(route.id)]);
    }
    renderListing(route.id);
  }

  if (route.name === "profile") {
    mergeListings(await window.kvartalApi.myListings());
    renderProfile();
  }

  if (route.name === "publish") {
    fillPublishForm(getListing(route.id));
  }

  if (route.name === "messages") {
    state.chats = (await window.kvartalApi.chats()).map((chat) => ({
      ...chat,
      messages: chat.lastMessage ? [{ text: chat.lastMessage, mine: false }] : []
    }));
    renderMessages();
  }
  if (route.name === "chat") await renderChat(route.id);
  if (route.name === "moderator") {
    mergeListings(await window.kvartalApi.moderationListings("pending"));
    renderModerator();
  }
  if (route.name === "review") {
    if (!getListing(route.id)) mergeListings([await window.kvartalApi.moderationListing(route.id)]);
    renderReview(route.id);
  }
  const isHome = route.name === "home";
  const shouldExpandWordmark = lastRenderedPage === "home" && !isHome;
  const shouldCollapseWordmark = Boolean(lastRenderedPage) && lastRenderedPage !== "home" && isHome;
  animatePageWordmark(isHome, shouldExpandWordmark, shouldCollapseWordmark);
  lastRenderedPage = route.name;
}

function showError(element, message) {
  element.hidden = false;
  element.textContent = message;
}

function animatePageWordmark(isHome, shouldExpand, shouldCollapse) {
  clearTimeout(wordmarkTimer);
  document.body.classList.remove("is-returning-home");
  pageWordmark.classList.remove("is-animating", "is-collapsing");

  if (!isHome) {
    pageWordmark.hidden = false;
    if (shouldExpand) {
      void pageWordmark.offsetWidth;
      pageWordmark.classList.add("is-animating");
    }
    return;
  }

  if (!shouldCollapse) {
    pageWordmark.hidden = true;
    return;
  }

  pageWordmark.hidden = false;
  document.body.classList.add("is-returning-home");
  void pageWordmark.offsetWidth;
  pageWordmark.classList.add("is-collapsing");
  wordmarkTimer = setTimeout(() => {
    pageWordmark.hidden = true;
    pageWordmark.classList.remove("is-collapsing");
    document.body.classList.remove("is-returning-home");
  }, 850);
}

document.querySelectorAll(".auth-screen").forEach((screen) => {
  screen.addEventListener("click", (event) => {
    if (event.target === screen) {
      closeAuthOverlay();
    }
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const visibleAuth = document.querySelector(".auth-screen:not([hidden])");
  if (visibleAuth) closeAuthOverlay();
});

document.addEventListener("error", (event) => {
  if (event.target instanceof HTMLImageElement) {
    event.target.classList.add("image-error");
  }
}, true);

document.addEventListener("load", (event) => {
  if (event.target instanceof HTMLImageElement) {
    event.target.classList.remove("image-error");
  }
}, true);

function openFilters(context) {
  state.filterContext = context;
  const filter = context === "favorites" ? state.favoriteFilter : state.filters;
  document.querySelector("#filters-dialog-title").textContent = context === "favorites" ? "Фильтры избранного" : "Фильтры";
  filtersForm.elements.kind.value = filter.kind;
  filtersForm.elements.rooms.value = filter.rooms;
  filtersForm.elements.district.value = filter.district;
  filtersForm.elements.orientation.value = filter.orientation;
  filtersForm.elements.minPrice.value = filter.minPrice;
  filtersForm.elements.maxPrice.value = filter.maxPrice;
  filtersForm.elements.minArea.value = filter.minArea;
  filtersForm.elements.maxArea.value = filter.maxArea;
  syncAllSelects(filtersForm);
  filtersDialog.showModal();
}

function readFilterForm() {
  const data = new FormData(filtersForm);
  return {
    kind: String(data.get("kind") || ""),
    rooms: String(data.get("rooms") || ""),
    district: String(data.get("district") || ""),
    orientation: String(data.get("orientation") || ""),
    minPrice: normalizePriceInput(data.get("minPrice")),
    maxPrice: String(data.get("maxPrice") || ""),
    minArea: String(data.get("minArea") || ""),
    maxArea: String(data.get("maxArea") || "")
  };
}

function showNotice(title, text, actionText, nextRoute) {
  document.querySelector("#notice-title").textContent = title;
  document.querySelector("#notice-text").textContent = text;
  document.querySelector("#notice-button").textContent = actionText;
  document.querySelector("#notice-button").dataset.route = nextRoute || "";
  noticeDialog.showModal();
}

async function startChat(listingId) {
  if (!state.user) {
    state.pendingRoute = `#/listing/${listingId}`;
    location.hash = "#/login";
    return;
  }

  try {
    const chat = await window.kvartalApi.createChat(listingId);
    await hydrateData();
    location.hash = `#/chat/${chat.id}`;
  } catch (error) {
    window.alert(error.message);
  }
}

document.querySelectorAll(".quiz-options input").forEach((input) => {
  input.addEventListener("change", () => {
    const key = input.name.replace("quiz-", "");
    state.quiz[key] = input.value;
    saveState();
    renderQuiz();
    renderHome();
  });
});

document.addEventListener("click", async (event) => {
  const passwordToggle = event.target.closest("[data-toggle-password], [data-password-toggle]");
  if (passwordToggle) {
    const input = passwordToggle.dataset.togglePassword
      ? document.getElementById(passwordToggle.dataset.togglePassword)
      : passwordToggle.parentElement.querySelector("input");
    if (input) {
      const shouldShow = input.type === "password";
      input.type = shouldShow ? "text" : "password";
      passwordToggle.textContent = shouldShow ? "Скрыть" : "Показать";
      passwordToggle.classList.toggle("visible", shouldShow);
      passwordToggle.setAttribute("aria-label", shouldShow ? "Скрыть пароль" : "Показать пароль");
    }
    return;
  }

  if (!event.target.closest(".enhanced-select")) {
    document.querySelectorAll(".enhanced-select.open").forEach((select) => {
      select.classList.remove("open");
      select.querySelector(".enhanced-select-trigger")?.setAttribute("aria-expanded", "false");
    });
  }

  const favorite = event.target.closest(".favorite-button");
  if (favorite) {
    if (!state.user) {
      state.pendingRoute = location.hash;
      location.hash = "#/login";
      return;
    }
    const id = Number(favorite.dataset.listingId);
    try {
      if (state.favorites.includes(id)) {
        await window.kvartalApi.removeFavorite(id);
        state.favorites = state.favorites.filter((item) => item !== id);
      } else {
        await window.kvartalApi.addFavorite(id);
        state.favorites = [...state.favorites, id];
      }
      await renderRoute();
    } catch (favoriteError) {
      window.alert(favoriteError.message);
    }
    return;
  }

  const openFilterButton = event.target.closest("[data-open-filters]");
  if (openFilterButton) {
    openFilters(openFilterButton.dataset.openFilters);
    return;
  }

  const sortButton = event.target.closest("[data-favorite-sort]");
  if (sortButton) {
    state.favoriteFilter.sort = sortButton.dataset.favoriteSort;
    saveState();
    renderFavorites();
    return;
  }

  const reasonButton = event.target.closest("[data-reason]");
  if (reasonButton) {
    state.reasonDecision = reasonButton.dataset.reason;
    document.querySelector("#reason-title").textContent =
      state.reasonDecision === "return" ? "Вернуть на исправление" : "Отклонить объявление";
    document.querySelector("#reason-submit").textContent =
      state.reasonDecision === "return" ? "Отправить автору" : "Отклонить";
    reasonForm.reset();
    reasonDialog.showModal();
    return;
  }

  if (event.target.closest("#open-moderation-guide")) {
    moderationGuideDialog.showModal();
    return;
  }

  const closeButton = event.target.closest("[data-close-listing]");
  if (closeButton) {
    closeListingId = Number(closeButton.dataset.closeListing);
    closeListingDialog.showModal();
    return;
  }

  const rateButton = event.target.closest("#chat-rate-seller");
  if (rateButton) {
    ratingChatId = Number(rateButton.dataset.chatId);
    const chat = currentChats().find((item) => item.id === ratingChatId);
    ratingForm.reset();
    if (chat?.myRating) {
      const input = ratingForm.querySelector(`[name="score"][value="${chat.myRating}"]`);
      if (input) input.checked = true;
    }
    ratingDialog.showModal();
    return;
  }

  if (event.target.closest("[data-close-dialog]")) {
    event.target.closest("dialog").close();
    return;
  }

  if (event.target.closest("#quiz-back")) {
    state.quizStep = Math.max(0, state.quizStep - 1);
    renderQuiz();
    return;
  }

  if (event.target.closest("#quiz-next")) {
    const quizKeys = ["kind", "rooms", "budget", "district", "priority", "orientation"];
    const currentKey = quizKeys[state.quizStep];
    if (!currentKey || !state.quiz[currentKey]) return;
    state.quizStep = Math.min(state.quizStep + 1, quizKeys.length);
    saveState();
    renderQuiz();
    renderHome();
    if (state.user && state.quizStep === quizKeys.length) {
      window.kvartalApi.savePreferences({
        maxPrice: state.quiz.budget ? Number(state.quiz.budget) : null,
        rooms: state.quiz.rooms && state.quiz.rooms !== "any" ? [Number(state.quiz.rooms)] : [],
        directions: state.quiz.orientation && state.quiz.orientation !== "any" ? [state.quiz.orientation] : [],
        districts: state.quiz.district && state.quiz.district !== "any" ? [state.quiz.district] : []
      }).catch(() => {});
    }
    return;
  }

  if (event.target.closest("#quiz-reset")) {
    state.quiz = {};
    state.quizStep = 0;
    saveState();
    renderQuiz();
    renderHome();
  }
});

document.addEventListener("submit", async (event) => {
  const form = event.target;

  if (form.id === "home-search-form") {
    event.preventDefault();
    const data = new FormData(form);
    state.filters = {
      query: String(data.get("query") || ""),
      kind: "",
      rooms: String(data.get("rooms") || ""),
      district: String(data.get("district") || ""),
      orientation: "",
      minPrice: "",
      maxPrice: normalizePriceInput(data.get("maxPrice")),
      minArea: "",
      maxArea: ""
    };
    saveState();
    location.hash = "#/search";
  }

  if (form.id === "search-form") {
    event.preventDefault();
    const data = new FormData(form);
    state.filters.query = String(data.get("query") || "");
    state.searchSort = String(data.get("sort") || "match");
    saveState();
    renderSearch();
  }

  if (form.id === "favorites-filter-form") {
    event.preventDefault();
    const data = new FormData(form);
    state.favoriteFilter = {
      ...state.favoriteFilter,
      minPrice: normalizePriceInput(data.get("minPrice")),
      maxPrice: normalizePriceInput(data.get("maxPrice")),
      minArea: String(data.get("minArea") || ""),
      maxArea: String(data.get("maxArea") || "")
    };
    saveState();
    renderFavorites();
  }

  if (form.id === "filters-form") {
    event.preventDefault();
    const values = readFilterForm();
    if (state.filterContext === "favorites") {
      state.favoriteFilter = { ...state.favoriteFilter, ...values };
    } else {
      state.filters = { ...state.filters, ...values };
    }
    saveState();
    filtersDialog.close();
    renderRoute();
  }

  if (form.id === "login-form") {
    event.preventDefault();
    const data = new FormData(form);
    const error = document.querySelector("#login-error");
    try {
      state.user = adaptUser(await window.kvartalApi.login({
        email: String(data.get("email") || ""),
        password: String(data.get("password") || "")
      }));
      error.hidden = true;
      let target = state.pendingRoute || "#/profile";
      if (state.user.role === "moderator") {
        target = target.startsWith("#/moderator") || target.startsWith("#/review")
          ? target
          : "#/moderator";
      } else if (target.startsWith("#/moderator") || target.startsWith("#/review")) {
        target = "#/profile";
      }
      goAfterAuth(target);
      hydrateData().catch(() => {
        showNotice(
          "Данные загружаются",
          "Вход выполнен. Если объявления или сообщения не появились, обновите страницу."
        );
      });
    } catch (loginError) {
      showError(error, loginError.message);
    }
  }

  if (form.id === "register-form") {
    event.preventDefault();
    const data = new FormData(form);
    const error = document.querySelector("#register-error");
    const password = String(data.get("password") || "");

    if (data.get("password") !== data.get("passwordRepeat")) {
      showError(error, "Пароли не совпадают");
      return;
    }
    if (!/(?=.*[A-ZА-ЯЁ])(?=.*[a-zа-яё])(?=.*\d).{8,}/u.test(password)) {
      showError(error, "Пароль должен содержать минимум 8 символов, заглавную и строчную буквы и цифру");
      return;
    }

    try {
      state.user = adaptUser(await window.kvartalApi.register({
        name: String(data.get("name") || "").trim(),
        email: String(data.get("email") || ""),
        password,
        birthDate: String(data.get("birthDate") || "") || undefined
      }));
      if (registrationPhoto) {
        state.user = adaptUser(await window.kvartalApi.updateMe({ avatarPath: registrationPhoto }));
      }
      await hydrateData();
      state.pendingRoute = "#/profile";
      error.hidden = true;
      registrationPhoto = "";
      goAfterAuth("#/profile");
    } catch (registerError) {
      showError(error, registerError.message);
    }
  }

  if (form.id === "profile-form") {
    event.preventDefault();
    const data = new FormData(form);
    try {
      state.user = adaptUser(await window.kvartalApi.updateMe({
      name: String(data.get("name") || "").trim(),
      email: String(data.get("email") || "").trim().toLowerCase(),
      birthDate: String(data.get("birthDate") || "")
      }));
      renderProfile();
      updateHeader(routeInfo());
    } catch (profileError) {
      window.alert(profileError.message);
    }
  }

  if (form.id === "publish-form") {
    event.preventDefault();
    const data = new FormData(form);
    const existingId = Number(form.dataset.listingId);
    const orientation = determineSunSide();
    if (!orientation) return;
    const photos = draftPhotos.filter(Boolean);
    if (!photos.length) {
      showNotice(
        "Добавьте фотографию",
        "Для публикации объявления требуется хотя бы одно фото квартиры.",
        "Понятно"
      );
      document.querySelector(".photo-upload-grid").scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
      return;
    }
    const rooms = Number(data.get("rooms"));
    const payload = {
      kind: String(data.get("kind") || "secondary"),
      rooms,
      price: Number(data.get("price")),
      area: Number(data.get("area")),
      floor: Number(data.get("floor")),
      totalFloors: Number(data.get("totalFloors")),
      parking: data.get("parking") === "true",
      district: String(data.get("district") || ""),
      orientations: [orientation],
      address: String(data.get("address") || ""),
      description: String(data.get("summary") || ""),
      photos
    };

    try {
      const saved = existingId
        ? await window.kvartalApi.updateListing(existingId, payload)
        : await window.kvartalApi.createListing(payload);
      mergeListings([saved]);
      await hydrateData();
      showNotice(
        "Объявление отправлено на проверку",
        "Модератор проверит обязательные поля и фотографии. Результат появится в рабочем пространстве.",
        "Перейти в личный кабинет",
        "#/profile"
      );
    } catch (publishError) {
      window.alert(publishError.message);
    }
  }

  if (form.id === "chat-form") {
    event.preventDefault();
    const data = new FormData(form);
    const chatId = Number(form.dataset.chatId);
    const text = String(data.get("message") || "").trim();
    if (!chatId || !text) return;

    try {
      await window.kvartalApi.sendMessage(chatId, text);
      form.reset();
      await renderChat(chatId);
    } catch (messageError) {
      window.alert(messageError.message);
    }
  }

  if (form.id === "seller-rating-form") {
    event.preventDefault();
    const data = new FormData(form);
    try {
      const result = await window.kvartalApi.rateSeller(ratingChatId, {
        score: Number(data.get("score")),
        comment: String(data.get("comment") || "").trim()
      });
      const chat = currentChats().find((item) => item.id === ratingChatId);
      if (chat) {
        chat.ratedByMe = true;
        chat.myRating = result.score;
      }
      ratingDialog.close();
      await renderChat(ratingChatId);
      showNotice(
        "Оценка сохранена",
        `Средняя оценка продавца: ${result.average.toFixed(1)} из 5. Всего оценок: ${result.count}.`,
        "Вернуться к переписке",
        `#/chat/${ratingChatId}`
      );
    } catch (ratingError) {
      window.alert(ratingError.message);
    }
  }

  if (form.id === "reason-form") {
    event.preventDefault();
    const data = new FormData(form);
    const reason = String(data.get("reason") || "").trim();

    try {
      const decision = state.reasonDecision === "return" ? "returned" : "rejected";
      await window.kvartalApi.decide(state.reviewId, { decision, reason });
      await hydrateData();
      reasonDialog.close();
      showNotice(
        decision === "returned" ? "Объявление возвращено автору" : "Объявление отклонено",
        reason,
        "Вернуться к очереди",
        "#/moderator"
      );
    } catch (reasonError) {
      window.alert(reasonError.message);
    }
  }
});

document.querySelector("#logout-button").addEventListener("click", logout);

document.querySelector("#detail-favorite").addEventListener("click", async (event) => {
  if (!state.user) {
    state.pendingRoute = location.hash;
    location.hash = "#/login";
    return;
  }
  const button = event.currentTarget;
  const id = Number(button.dataset.listingId);
  try {
    if (state.favorites.includes(id)) {
      await window.kvartalApi.removeFavorite(id);
      state.favorites = state.favorites.filter((item) => item !== id);
    } else {
      await window.kvartalApi.addFavorite(id);
      state.favorites = [...state.favorites, id];
    }
    await renderRoute();
  } catch (error) {
    window.alert(error.message);
  }
});

document.querySelector("#detail-message").addEventListener("click", (event) => {
  startChat(Number(event.currentTarget.dataset.listingId));
});

document.querySelector("#profile-photo-edit").addEventListener("click", () => {
  document.querySelector("#profile-photo-input").click();
});

document.querySelector("#register-photo-input").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      const maxSize = 640;
      const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      registrationPhoto = canvas.toDataURL("image/jpeg", 0.84);
    };
    image.src = reader.result;
  };
  reader.readAsDataURL(file);
});

document.querySelector("#profile-photo-input").addEventListener("change", async (event) => {
  const input = event.currentTarget;
  const file = input.files[0];
  if (!file) return;

  input.value = "";
  const status = document.querySelector("#profile-photo-status");
  status.hidden = false;
  status.classList.remove("error");
  status.textContent = "Сохраняем фотографию…";

  try {
    if (!file.type.startsWith("image/")) throw new Error("Выберите файл изображения");
    const photo = await compressImageFile(file, 960, 0.82);
    state.user = adaptUser(await window.kvartalApi.updateMe({ avatarPath: photo }));
    status.textContent = "Фото профиля сохранено";

    try {
      renderProfile();
      updateHeader(routeInfo());
    } catch (renderError) {
      console.error(renderError);
    }
  } catch (error) {
    status.classList.add("error");
    const details = error.details?.fieldErrors?.avatarPath?.[0];
    status.textContent = details
      ? `Не удалось сохранить фотографию: ${details}`
      : error.status
        ? `Не удалось сохранить фотографию: ${error.message} (код ${error.status})`
        : `Не удалось сохранить фотографию: ${error.message || "неизвестная ошибка"}`;
    window.alert(error.message || "Не удалось сохранить фотографию");
  }
});

const sunDirections = {
  morning: "Восток",
  day: "Юг",
  evening: "Запад",
  none: "Север"
};

function determineSunSide(showError = true) {
  const form = document.querySelector("#publish-form");
  const period = form.elements.sunTime.value;
  const direction = sunDirections[period];
  const status = document.querySelector("#sun-side-status");

  if (!direction) {
    status.hidden = false;
    status.textContent = showError ? "Сначала выберите, когда в квартире бывает солнце" : "";
    return "";
  }

  status.hidden = true;
  status.textContent = "";
  document.querySelector("#sun-side-value").textContent = direction;
  document.querySelector("#sun-side-result").hidden = false;
  return direction;
}

document.querySelector("#determine-sun-side").addEventListener("click", () => {
  determineSunSide();
});

document.querySelectorAll("input[name='sunTime']").forEach((input) => {
  input.addEventListener("change", () => {
    document.querySelector("#sun-side-result").hidden = true;
    document.querySelector("#sun-side-status").hidden = true;
  });
});

document.querySelector("#approve-listing").addEventListener("click", async () => {
  try {
    await window.kvartalApi.decide(state.reviewId, { decision: "approved" });
    await hydrateData();
    showNotice(
      "Объявление одобрено",
      "Объявление опубликовано в каталоге, автор получил уведомление.",
      "Вернуться к очереди",
      "#/moderator"
    );
  } catch (error) {
    window.alert(error.message);
  }
});

document.querySelector("#notice-button").addEventListener("click", () => {
  const route = document.querySelector("#notice-button").dataset.route;
  noticeDialog.close();
  if (route) location.hash = route;
});

document.querySelector("#cancel-close-listing").addEventListener("click", () => {
  closeListingDialog.close();
  closeListingId = null;
});

document.querySelector("#confirm-close-listing").addEventListener("click", async () => {
  if (!closeListingId) return;
  const id = closeListingId;
  const button = document.querySelector("#confirm-close-listing");
  button.disabled = true;
  try {
    await window.kvartalApi.closeListing(id);
    closeListingDialog.close();
    await hydrateData();
    renderProfile();
    showNotice(
      "Объявление закрыто",
      "Покупатель отмечен как найденный. Объявление больше не показывается в поиске.",
      "Понятно",
      "#/profile"
    );
  } catch (closeError) {
    window.alert(closeError.message);
  } finally {
    button.disabled = false;
    closeListingId = null;
  }
});

document.querySelector("#reset-search-filters").addEventListener("click", () => {
  state.filters = { query: "", kind: "", rooms: "", district: "", orientation: "", minPrice: "", maxPrice: "", minArea: "", maxArea: "" };
  saveState();
  renderSearch();
});

document.querySelector("#filters-reset").addEventListener("click", () => {
  filtersForm.reset();
  syncAllSelects(filtersForm);
});

function compressImageFile(file, maxSize, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не удалось прочитать фотографию"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Формат фотографии не поддерживается. Выберите JPG или PNG"));
      image.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

document.querySelectorAll("[data-photo-input]").forEach((input) => {
  input.addEventListener("change", async () => {
    const files = Array.from(input.files || []);
    if (!files.length) return;

    const requestedIndex = Number(input.dataset.photoInput);
    const available = [0, 1, 2].filter((index) => !draftPhotos[index]);
    const targets = requestedIndex === 3 ? available : [requestedIndex];
    if (!targets.length) {
      window.alert("Можно загрузить до трёх фотографий");
      input.value = "";
      return;
    }

    for (let offset = 0; offset < Math.min(files.length, targets.length); offset += 1) {
      try {
        const photo = await compressImageFile(files[offset], 1400, 0.78);
        const index = targets[offset];
        draftPhotos[index] = photo;
        const preview = ["#publish-photo-one", "#publish-photo-two", "#publish-photo-three"][index];
        const image = document.querySelector(preview);
        image.classList.remove("image-error");
        image.src = photo;
        image.hidden = false;
      } catch {
        window.alert("Не удалось обработать фотографию");
      }
    }
    input.value = "";
    renderPublishPreview();
  });
});

document.querySelector("#publish-form").addEventListener("input", renderPublishPreview);
document.querySelector("#publish-form").addEventListener("change", renderPublishPreview);

function handleApiError(error) {
  showNotice(
    "Ошибка соединения",
    error.message || "Проверьте, что backend и PostgreSQL запущены.",
    "Перейти на главную",
    "#/home"
  );
}

window.addEventListener("hashchange", () => {
  renderRoute().catch(handleApiError);
});
enhanceAllSelects();
document.querySelectorAll("img").forEach((image) => {
  if (image.complete && image.naturalWidth === 0) {
    image.classList.add("image-error");
  }
});

(async function boot() {
  try {
    await hydrateData();
    await renderRoute();
  } catch (error) {
    state.user = null;
    state.listings = [];
    showScreen("home");
    updateHeader({ name: "home" });
    renderQuiz();
    renderHome();
    handleApiError(error);
  }
})();
