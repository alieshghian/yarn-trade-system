// Please see documentation at https://learn.microsoft.com/aspnet/core/client-side/bundling-and-minification
// for details on configuring this project to bundle and minify static web assets.

const parseGroupedInteger = (value) => {
    const raw = String(value || "").replace(/,/g, "").replace(/[^\d.-]/g, "");
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? Math.round(parsed) : 0;
};

const parseGroupedNumber = (value) => {
    const raw = String(value || "").replace(/,/g, "").replace(/[^\d.-]/g, "");
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
};

const formatGroupedInteger = (value) => {
    return parseGroupedInteger(value).toLocaleString("en-US");
};

const inputDecimalPlaces = (input) => {
    const places = Number.parseInt(input?.dataset.decimalPlaces || "0", 10);
    return Number.isFinite(places) && places > 0 ? places : 0;
};

const roundToInputStep = (value, input) => {
    const decimals = inputDecimalPlaces(input);
    if (decimals > 0) {
        const factor = 10 ** decimals;
        return Math.round(parseGroupedNumber(value) * factor) / factor;
    }

    const step = Number.parseInt(input?.dataset.roundStep || "1", 10);
    const parsed = parseGroupedInteger(value);
    return Number.isFinite(step) && step > 1 ? Math.round(parsed / step) * step : parsed;
};

const formatMoneyValue = (value, input) => {
    const decimals = inputDecimalPlaces(input);
    return Number(value || 0).toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
};

const formatMoneyWhileTyping = (value, input) => {
    const decimals = inputDecimalPlaces(input);
    if (decimals === 0) {
        return parseGroupedInteger(value).toLocaleString("en-US");
    }

    const raw = String(value || "").replace(/,/g, "").replace(/[^\d.]/g, "");
    const [integerPart = "", fractionPart] = raw.split(".");
    const integerValue = integerPart === "" ? "" : Number(integerPart).toLocaleString("en-US");
    if (raw.includes(".")) {
        return `${integerValue}.${String(fractionPart || "").slice(0, decimals)}`;
    }

    return integerValue;
};

const normalizeSearchText = (value) => {
    return String(value || "")
        .toLowerCase()
        .replace(/[يى]/g, "ی")
        .replace(/ك/g, "ک")
        .replace(/ة/g, "ه")
        .replace(/[أإآ]/g, "ا")
        .replace(/[ۀؤ]/g, "و")
        .replace(/[‌ـ]/g, " ")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
};

const searchMatches = (haystack, term) => {
    const normalizedTerm = normalizeSearchText(term);
    if (!normalizedTerm) {
        return true;
    }

    const normalizedHaystack = normalizeSearchText(haystack);
    const compactTerm = normalizedTerm.replace(/\s+/g, "");
    const compactHaystack = normalizedHaystack.replace(/\s+/g, "");
    if (compactHaystack.includes(compactTerm)) {
        return true;
    }

    return normalizedTerm
        .split(/\s+/)
        .filter(Boolean)
        .every((token) => normalizedHaystack.includes(token) || compactHaystack.includes(token));
};

function bindFactoryPriceInputs(root = document) {
    root.querySelectorAll("[data-factory-price-input]").forEach((input) => {
        if (input.dataset.factoryProfitBound) return;

        const row = input.closest(".factory-price-row");
        const badge = input.closest(".factory-price-input-wrap")?.querySelector(".factory-cash-profit-badge");
        const currentProfitLabel = row?.querySelector("[data-factory-current-profit-label]");
        const costBase = parseGroupedInteger(input.dataset.costBase);
        const baseProfit = Number.parseFloat(input.dataset.baseProfit || "0");
        const vatRate = Number.parseFloat(input.dataset.vatRate || "0") / 100;
        if (!badge || costBase <= 0) return;

        input.dataset.factoryProfitBound = "1";
        const formatPercent = (value) => {
            const absolute = Math.abs(value);
            const text = absolute.toLocaleString("en-US", {
                maximumFractionDigits: 1,
                minimumFractionDigits: 1
            });
            return `\u200E${value < 0 ? "-" : ""}${text}٪\u200E`;
        };

        const updateFactoryProfit = () => {
            const inputPriceWithVat = parseGroupedInteger(input.value);
            const factoryPrice = Math.round(Math.max(0, inputPriceWithVat) / (1 + vatRate) / 100) * 100;
            const difference = factoryPrice - costBase;
            const signedPercent = difference / costBase * 100;

            badge.classList.remove("is-up", "is-down", "is-even");
            if (!Number.isFinite(signedPercent)) {
                badge.textContent = "";
                if (currentProfitLabel) currentProfitLabel.textContent = "فعلی -";
                return;
            }

            badge.textContent = `(${formatPercent(signedPercent)})`;
            const profitDifference = signedPercent - baseProfit;
            if (Math.abs(profitDifference) < 0.0001) {
                badge.classList.add("is-even");
                currentProfitLabel?.classList.remove("is-up", "is-down");
                currentProfitLabel?.classList.add("is-even");
            } else if (profitDifference > 0) {
                badge.classList.add("is-up");
                currentProfitLabel?.classList.remove("is-down", "is-even");
                currentProfitLabel?.classList.add("is-up");
            } else {
                badge.classList.add("is-down");
                currentProfitLabel?.classList.remove("is-up", "is-even");
                currentProfitLabel?.classList.add("is-down");
            }

            if (currentProfitLabel) currentProfitLabel.textContent = `فعلی ${formatPercent(signedPercent)}`;
        };

        input.addEventListener("input", updateFactoryProfit);
        input.addEventListener("blur", updateFactoryProfit);
        updateFactoryProfit();
    });
}

(() => {
    const embeddedParam = "embedded";

    const withEmbeddedParam = (href) => {
        const url = new URL(href, window.location.origin);
        if (url.origin !== window.location.origin) {
            return href;
        }

        url.searchParams.set(embeddedParam, "1");
        return `${url.pathname}${url.search}${url.hash}`;
    };

    const shouldUseNormalNavigation = (href) => {
        let url;
        try {
            url = new URL(href, window.location.origin);
        } catch {
            return true;
        }

        if (url.origin !== window.location.origin) {
            return true;
        }

        return ["/Logout", "/Login"].some((path) =>
            url.pathname.toLowerCase() === path.toLowerCase());
    };

    const bindAutoCollapsibleSidePanels = (root = document) => {
        const panels = root.querySelectorAll(".crud-layout > .side-panel, .workspace > .side-panel");
        panels.forEach((panel) => {
            const container = panel.parentElement;
            if (!container || panel.dataset.autoCollapseBound) {
                return;
            }

            panel.dataset.autoCollapseBound = "1";
            container.classList.add("has-collapsible-side-panel");

            const toggle = document.createElement("button");
            toggle.type = "button";
            toggle.className = "side-panel-toggle no-print";
            toggle.setAttribute("aria-label", "باز و بسته کردن پنل سمت راست");
            toggle.textContent = "پنل";
            panel.insertAdjacentElement("afterend", toggle);

            const pinKey = `side-panel-pinned:${window.location.pathname.toLowerCase()}`;
            const isPinned = () => {
                try {
                    return window.sessionStorage.getItem(pinKey) === "true";
                } catch {
                    return false;
                }
            };
            const pin = document.createElement("button");
            pin.type = "button";
            pin.className = "side-panel-pin no-print";
            pin.setAttribute("aria-label", "سنجاق کردن پنل سمت راست");
            pin.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><path d="m16 3 5 5-4 1-3 3 3 3v2h-5v5h-2v-5H5v-2l3-3-3-3-3-1 5-5 2 2v5h5V5l2-2Z"/></svg><span></span>';
            const syncPin = () => {
                const pinned = isPinned();
                pin.setAttribute("aria-pressed", pinned ? "true" : "false");
                pin.setAttribute("aria-label", pinned ? "برداشتن سنجاق از پنل" : "سنجاق کردن پنل سمت راست");
                pin.title = pinned ? "برداشتن سنجاق؛ پنل باز می‌ماند" : "سنجاق کردن و باز نگه داشتن پنل";
                pin.classList.toggle("is-pinned", pinned);
                pin.querySelector("span").textContent = pinned ? "سنجاق‌شده" : "سنجاق پنل";
            };
            panel.insertBefore(pin, panel.firstChild);
            syncPin();

            const setCollapsed = (collapsed) => {
                container.classList.toggle("side-panel-collapsed", collapsed);
                toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
                toggle.title = collapsed ? "نمایش پنل سمت راست" : "جمع کردن پنل سمت راست";
            };

            toggle.addEventListener("click", () => {
                setCollapsed(!container.classList.contains("side-panel-collapsed"));
            });

            pin.addEventListener("click", () => {
                const pinned = !isPinned();
                try {
                    if (pinned) {
                        window.sessionStorage.setItem(pinKey, "true");
                    } else {
                        window.sessionStorage.removeItem(pinKey);
                    }
                } catch {
                    // The panel remains usable when browser storage is unavailable.
                }
                syncPin();
                if (pinned) {
                    setCollapsed(false);
                }
            });

            window.setTimeout(() => {
                if (isPinned() || window.innerWidth < 900 || panel.contains(document.activeElement)) {
                    return;
                }

                setCollapsed(true);
            }, 2500);
        });
    };

    if (document.body.classList.contains("app-embedded")) {
        let embeddedNavigationVersion = 0;
        let activeLiveSearchController = null;
        let embeddedHasUnsavedChanges = false;

        const postToTabHost = (message) => {
            if (window.parent !== window) {
                window.parent.postMessage(message, window.location.origin);
            }
        };

        const setEmbeddedDirty = (isDirty) => {
            if (embeddedHasUnsavedChanges === isDirty) {
                return;
            }

            embeddedHasUnsavedChanges = isDirty;
            postToTabHost({ type: "app-tab-dirty", isDirty });
        };

        const notifyDataChanged = () => {
            setEmbeddedDirty(false);
            postToTabHost({ type: "app-data-changed" });
        };

        const bindEmbeddedDirtyTracking = (root = document) => {
            root.querySelectorAll("form").forEach((form) => {
                const method = (form.getAttribute("method") || "get").toLowerCase();
                if (method !== "post" || form.dataset.dirtyTrackingBound) {
                    return;
                }

                form.dataset.dirtyTrackingBound = "1";
                form.addEventListener("input", () => setEmbeddedDirty(true));
                form.addEventListener("change", () => setEmbeddedDirty(true));
            });
        };

        const ensureEmbeddedForm = (form) => {
            if (!form.querySelector(`input[name='${embeddedParam}']`)) {
                const input = document.createElement("input");
                input.type = "hidden";
                input.name = embeddedParam;
                input.value = "1";
                form.appendChild(input);
            }

            const action = form.getAttribute("action") || window.location.href;
            try {
                form.setAttribute("action", withEmbeddedParam(new URL(action, window.location.href).href));
            } catch {
                return;
            }
        };

        const getFormFocusState = (form, url) => {
            const focused = document.activeElement;
            if (!(focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement || focused instanceof HTMLSelectElement) ||
                !form.contains(focused) ||
                !focused.name) {
                return null;
            }

            return {
                name: focused.name,
                value: focused.value,
                expectedValue: url.searchParams.get(focused.name) ?? focused.value,
                cursor: typeof focused.selectionStart === "number" ? focused.selectionStart : null,
                scrollX: window.scrollX,
                scrollY: window.scrollY,
                live: !!focused.closest("[data-live-search-form]")
            };
        };

        const bindEmbeddedForms = (root = document) => {
            root.querySelectorAll("form").forEach((form) => {
                ensureEmbeddedForm(form);
                if (form.dataset.embeddedFormBound) {
                    return;
                }

                form.dataset.embeddedFormBound = "1";
                form.addEventListener("submit", (event) => {
                    if (event.defaultPrevented) {
                        return;
                    }
                    ensureEmbeddedForm(form);
                    const method = (form.getAttribute("method") || "get").toLowerCase();
                    if (method !== "get" && method !== "post") {
                        return;
                    }

                    if (method === "post" && !isAjaxSafePostForm(form)) {
                        notifyDataChanged();
                        return;
                    }

                    event.preventDefault();
                    if (method === "get") {
                        const action = form.getAttribute("action") || window.location.href;
                        const url = new URL(action, window.location.href);
                        new FormData(form).forEach((value, key) => {
                            url.searchParams.set(key, value);
                        });
                        navigateEmbedded(url.href, false, getFormFocusState(form, url));
                        return;
                    }

                    const submitter = event.submitter;
                    window.setTimeout(() => submitEmbeddedForm(form, submitter), 0);
                });
            });
        };

        const isAjaxSafePostForm = (form) => {
            if (form.target === "_blank" ||
                form.dataset.noAjaxPost ||
                form.dataset.ajaxDeleteComponent !== undefined ||
                form.dataset.ajaxAddComponent !== undefined ||
                form.classList.contains("danger-zone") ||
                form.id?.startsWith("delete-")) {
                return false;
            }

            const action = form.getAttribute("action") || window.location.href;
            if (/handler=(delete|deletediscount|download)/i.test(action)) {
                return false;
            }

            return !form.querySelector("button[type='submit'].btn-danger, button[type='submit'].btn-outline-danger");
        };

        const setFormBusy = (form, isBusy) => {
            form.classList.toggle("is-ajax-saving", isBusy);
            form.querySelectorAll("button[type='submit'], input[type='submit']").forEach((button) => {
                if (isBusy) {
                    button.dataset.ajaxWasDisabled = button.disabled ? "1" : "0";
                    button.disabled = true;
                } else if (button.dataset.ajaxWasDisabled === "0") {
                    button.disabled = false;
                    delete button.dataset.ajaxWasDisabled;
                }
            });
        };

        const buildFormData = (form, submitter) => {
            let data;
            try {
                data = submitter ? new FormData(form, submitter) : new FormData(form);
            } catch {
                data = new FormData(form);
                if (submitter?.name) {
                    data.append(submitter.name, submitter.value || "");
                }
            }

            data.set(embeddedParam, "1");
            return data;
        };

        const submitEmbeddedForm = async (form, submitter) => {
            ensureEmbeddedForm(form);
            const action = form.getAttribute("action") || window.location.href;
            const url = new URL(action, window.location.href);
            url.searchParams.set(embeddedParam, "1");
            const shell = document.querySelector(".app-shell");
            setFormBusy(form, true);
            shell?.classList.add("is-pjax-loading");

            try {
                const response = await fetch(url.href, {
                    method: "POST",
                    body: buildFormData(form, submitter),
                    headers: { "X-Requested-With": "XMLHttpRequest" },
                    cache: "no-store",
                    redirect: "follow"
                });

                const contentType = response.headers.get("content-type") || "";
                if (!response.ok || !contentType.includes("text/html")) {
                    throw new Error("save failed");
                }

                replaceEmbeddedContent(await response.text(), response.url || url.href, true);
                notifyDataChanged();
            } catch {
                notifyDataChanged();
                form.submit();
            } finally {
                setFormBusy(form, false);
                shell?.classList.remove("is-pjax-loading");
            }
        };

        const executeInlineScripts = (doc) => {
            doc.querySelectorAll("script:not([src])").forEach((oldScript) => {
                const script = document.createElement("script");
                script.text = oldScript.textContent || "";
                document.body.appendChild(script);
                script.remove();
            });
        };

        const bindLiveSearchForms = (root = document) => {
            root.querySelectorAll("[data-live-search-form]").forEach((form) => {
                if (form.dataset.liveSearchBound) {
                    return;
                }

                form.dataset.liveSearchBound = "1";
                const input = form.querySelector("[data-live-search-input]");
                const initialValue = input?.value || "";
                let submitTimer = null;
                const submit = (force = false) => {
                    if (!force && input?.value === initialValue) {
                        return;
                    }

                    form.requestSubmit();
                };

                input?.addEventListener("input", () => {
                    window.clearTimeout(submitTimer);
                    submitTimer = window.setTimeout(submit, 550);
                });

                input?.addEventListener("keydown", (event) => {
                    if (event.key === "Enter") {
                        event.preventDefault();
                        window.clearTimeout(submitTimer);
                        submit(true);
                    }
                });

                form.querySelectorAll("[data-live-search-submit-on-change]").forEach((control) => {
                    control.addEventListener("change", () => {
                        window.clearTimeout(submitTimer);
                        submit(true);
                    });
                });
            });
        };

        const bindMoneyInputs = (root = document) => {
            root.querySelectorAll("[data-number-format='money']").forEach((input) => {
                if (input.dataset.moneyBound) {
                    return;
                }

                input.dataset.moneyBound = "1";
                const format = (roundToStep = false) => {
                    if (!roundToStep) {
                        input.value = formatMoneyWhileTyping(input.value, input);
                        return;
                    }

                    const value = roundToInputStep(input.value, input);
                    input.value = formatMoneyValue(value, input);
                };

                input.addEventListener("input", () => {
                    const caretWasAtEnd = input.selectionStart === input.value.length;
                    format();
                    if (caretWasAtEnd) {
                        input.setSelectionRange(input.value.length, input.value.length);
                    }
                });

                input.addEventListener("blur", () => format(true));
                format(true);
            });
        };

        const bindProductComboboxes = (root = document) => {
            root.querySelectorAll("[data-product-combobox]").forEach((combo) => {
                if (combo.dataset.productComboboxBound) {
                    return;
                }

                combo.dataset.productComboboxBound = "1";
                const form = combo.closest("form");
                const search = combo.querySelector(".js-product-search");
                const hidden = combo.querySelector(".js-product-code");
                const toggle = combo.querySelector(".product-combobox__toggle");
                const options = [...combo.querySelectorAll(".product-combobox__option")];
                if (!search || !hidden) {
                    return;
                }

                const open = () => {
                    const rect = combo.getBoundingClientRect();
                    const spaceBelow = window.innerHeight - rect.bottom;
                    combo.classList.toggle("product-combobox--drop-up", spaceBelow < 280 && rect.top > spaceBelow);
                    combo.classList.add("open");
                    search.setAttribute("aria-expanded", "true");
                };

                const close = () => {
                    combo.classList.remove("open");
                    combo.classList.remove("product-combobox--drop-up");
                    search.setAttribute("aria-expanded", "false");
                };

                const filter = () => {
                    const term = search.value;
                    options.forEach((option) => {
                        const haystack = `${option.dataset.productCode || ""} ${option.dataset.productLabel || ""}`;
                        option.hidden = !searchMatches(haystack, term);
                    });
                };

                const choose = (option) => {
                    hidden.value = option.dataset.productCode || "";
                    search.value = option.dataset.productLabel || option.dataset.productCode || "";
                    form?.requestSubmit();
                };

                search.addEventListener("focus", () => {
                    filter();
                    open();
                });
                search.addEventListener("input", () => {
                    hidden.value = "";
                    filter();
                    open();
                });
                search.addEventListener("keydown", (event) => {
                    if (event.key === "Enter") {
                        event.preventDefault();
                        const firstVisible = options.find((option) => !option.hidden);
                        if (firstVisible) {
                            choose(firstVisible);
                        }
                    }

                    if (event.key === "Escape") {
                        close();
                    }
                });
                toggle?.addEventListener("click", () => {
                    filter();
                    combo.classList.contains("open") ? close() : open();
                    search.focus();
                });
                options.forEach((option) => option.addEventListener("click", () => choose(option)));
                document.addEventListener("click", (event) => {
                    if (!combo.contains(event.target)) {
                        close();
                    }
                });
            });
        };

        const bindMaterialComboboxes = (root = document) => {
            root.querySelectorAll("[data-material-combobox]").forEach((combo) => {
                if (combo.dataset.materialComboboxBound) {
                    return;
                }

                combo.dataset.materialComboboxBound = "1";
                const search = combo.querySelector(".js-material-search");
                const hidden = combo.querySelector(".js-material-name");
                const toggle = combo.querySelector(".product-combobox__toggle");
                const refresh = combo.querySelector(".product-combobox__refresh");
                const optionsContainer = combo.querySelector(".product-combobox__options");
                const getOptions = () => [...combo.querySelectorAll(".product-combobox__option")];
                let refreshPromise = null;
                let liveRefreshCompleted = false;
                if (!search || !hidden) {
                    return;
                }

                const open = () => {
                    const rect = combo.getBoundingClientRect();
                    const spaceBelow = window.innerHeight - rect.bottom;
                    combo.classList.toggle("product-combobox--drop-up", spaceBelow < 280 && rect.top > spaceBelow);
                    combo.classList.add("open");
                    search.setAttribute("aria-expanded", "true");
                };

                const close = () => {
                    combo.classList.remove("open");
                    combo.classList.remove("product-combobox--drop-up");
                    search.setAttribute("aria-expanded", "false");
                };

                const filter = () => {
                    const term = search.value;
                    getOptions().forEach((option) => {
                        const haystack = `${option.dataset.materialName || ""} ${option.dataset.materialLabel || ""}`;
                        option.hidden = !searchMatches(haystack, term);
                    });
                };

                const choose = (option) => {
                    hidden.value = option.dataset.materialName || "";
                    search.value = option.dataset.materialLabel || hidden.value;
                    combo.dispatchEvent(new CustomEvent("material:selected", { detail: { option } }));
                    close();
                };

                const refreshOptions = () => {
                    const refreshUrl = combo.dataset.materialRefreshUrl;
                    if (!refreshUrl || !optionsContainer) {
                        return Promise.resolve(false);
                    }
                    if (refreshPromise) {
                        return refreshPromise;
                    }

                    const selectedValue = hidden.value;
                    const selectedOption = getOptions().find((option) => option.dataset.materialName === selectedValue);
                    if (refresh) {
                        refresh.disabled = true;
                        refresh.classList.remove("has-error");
                        refresh.classList.add("is-loading");
                        refresh.title = "در حال به‌روزرسانی...";
                    }

                    refreshPromise = fetch(refreshUrl, {
                        headers: { "Accept": "application/json" },
                        cache: "no-store"
                    }).then((response) => {
                        if (!response.ok) {
                            throw new Error("refresh failed");
                        }
                        return response.json();
                    }).then((materials) => {
                        optionsContainer.replaceChildren(...materials.map((material) => {
                            const option = document.createElement("button");
                            option.type = "button";
                            option.className = "product-combobox__option";
                            option.dataset.materialName = material.value;
                            option.dataset.materialLabel = material.label;
                            option.dataset.materialPrice = String(material.price ?? 0);
                            option.dataset.materialUnit = material.unit || "—";
                            option.textContent = material.label;
                            return option;
                        }));

                        if (selectedValue && !getOptions().some((option) => option.dataset.materialName === selectedValue) && selectedOption) {
                            optionsContainer.prepend(selectedOption.cloneNode(true));
                        }

                        filter();
                        open();
                        combo.dispatchEvent(new CustomEvent("materials:refreshed"));
                        if (refresh) {
                            refresh.title = "فهرست به‌روزرسانی شد";
                        }
                        return true;
                    }).catch(() => {
                        if (refresh) {
                            refresh.title = "به‌روزرسانی فهرست انجام نشد";
                            refresh.classList.add("has-error");
                        }
                        return false;
                    }).finally(() => {
                        if (refresh) {
                            refresh.disabled = false;
                            refresh.classList.remove("is-loading");
                        }
                        refreshPromise = null;
                    });

                    return refreshPromise;
                };

                search.addEventListener("focus", async () => {
                    filter();
                    open();
                    if (combo.dataset.materialLiveRefresh === "true" && !liveRefreshCompleted) {
                        liveRefreshCompleted = await refreshOptions();
                    }
                });
                search.addEventListener("input", () => {
                    hidden.value = "";
                    filter();
                    open();
                });
                search.addEventListener("keydown", (event) => {
                    if (event.key === "Enter") {
                        event.preventDefault();
                        const firstVisible = getOptions().find((option) => !option.hidden);
                        if (firstVisible) {
                            choose(firstVisible);
                        }
                    }

                    if (event.key === "Escape") {
                        close();
                    }
                });
                toggle?.addEventListener("click", () => {
                    filter();
                    combo.classList.contains("open") ? close() : open();
                    search.focus();
                });
                optionsContainer?.addEventListener("click", (event) => {
                    const option = event.target.closest(".product-combobox__option");
                    if (option && optionsContainer.contains(option)) {
                        choose(option);
                    }
                });
                refresh?.addEventListener("click", async () => {
                    await refreshOptions();
                    search.focus();
                    search.select();
                });
                document.addEventListener("click", (event) => {
                    if (!combo.contains(event.target)) {
                        close();
                    }
                });
            });
        };

        const bindCopyProductComboboxes = (root = document) => {
            root.querySelectorAll("[data-copy-product-combobox]").forEach((combo) => {
                if (combo.dataset.copyProductComboboxBound) {
                    return;
                }

                combo.dataset.copyProductComboboxBound = "1";
                const search = combo.querySelector(".js-copy-product-search");
                const hidden = combo.querySelector(".js-copy-product-id");
                const toggle = combo.querySelector(".product-combobox__toggle");
                const options = [...combo.querySelectorAll(".product-combobox__option")];
                if (!search || !hidden) {
                    return;
                }

                const open = () => {
                    combo.classList.add("open");
                    search.setAttribute("aria-expanded", "true");
                };

                const close = () => {
                    combo.classList.remove("open");
                    search.setAttribute("aria-expanded", "false");
                };

                const filter = () => {
                    const term = search.value;
                    options.forEach((option) => {
                        const haystack = `${option.dataset.productCode || ""} ${option.dataset.productLabel || ""}`;
                        option.hidden = !searchMatches(haystack, term);
                    });
                };

                const choose = (option) => {
                    hidden.value = option.dataset.productId || "";
                    search.value = option.dataset.productLabel || option.dataset.productCode || "";
                    close();
                };

                search.addEventListener("focus", () => {
                    filter();
                    open();
                });
                search.addEventListener("input", () => {
                    hidden.value = "";
                    filter();
                    open();
                });
                search.addEventListener("keydown", (event) => {
                    if (event.key === "Enter") {
                        event.preventDefault();
                        const firstVisible = options.find((option) => !option.hidden);
                        if (firstVisible) {
                            choose(firstVisible);
                        }
                    }

                    if (event.key === "Escape") {
                        close();
                    }
                });
                toggle?.addEventListener("click", () => {
                    filter();
                    combo.classList.contains("open") ? close() : open();
                    search.focus();
                });
                options.forEach((option) => option.addEventListener("click", () => choose(option)));
                document.addEventListener("click", (event) => {
                    if (!combo.contains(event.target)) {
                        close();
                    }
                });
            });
        };

        const initializeEmbeddedContent = (root = document) => {
            bindEmbeddedLinks(root);
            bindEmbeddedForms(root);
            bindEmbeddedDirtyTracking(root);
            bindLiveSearchForms(root);
            bindMoneyInputs(root);
            bindFactoryPriceInputs(root);
            bindProductComboboxes(root);
            bindMaterialComboboxes(root);
            bindCopyProductComboboxes(root);
            bindAutoCollapsibleSidePanels(root);
        };

        const restoreFocusState = (focusState) => {
            if (!focusState?.name) {
                return;
            }

            const control = document.querySelector(`[name="${CSS.escape(focusState.name)}"]`);
            if (!control) {
                return;
            }

            control.focus({ preventScroll: true });
            if (typeof control.setSelectionRange === "function" && focusState.cursor !== null) {
                const cursor = Math.min(focusState.cursor, control.value.length);
                control.setSelectionRange(cursor, cursor);
            }
            window.setTimeout(() => {
                window.scrollTo(Number(focusState.scrollX || 0), Number(focusState.scrollY || 0));
            }, 0);
        };

        const replaceEmbeddedContent = (html, url, replaceHistory = false, focusState = null) => {
            const doc = new DOMParser().parseFromString(html, "text/html");
            const nextShell = doc.querySelector(".app-shell");
            const currentShell = document.querySelector(".app-shell");
            if (!nextShell || !currentShell) {
                window.location.href = withEmbeddedParam(url);
                return;
            }

            currentShell.classList.remove("is-pjax-loading");
            currentShell.innerHTML = nextShell.innerHTML;
            document.title = doc.title || document.title;
            if (replaceHistory) {
                window.history.replaceState({ embedded: true }, "", url);
            } else {
                window.history.pushState({ embedded: true }, "", url);
            }

            initializeEmbeddedContent(currentShell);
            executeInlineScripts(doc);
            if (focusState) {
                restoreFocusState(focusState);
            } else {
                window.scrollTo(0, 0);
            }

            setEmbeddedDirty(false);
            postToTabHost({ type: "app-tab-content-current" });
        };

        const navigateEmbedded = async (href, replaceHistory = false, focusState = null) => {
            if (shouldUseNormalNavigation(href)) {
                window.parent.location.href = href;
                return;
            }

            const url = new URL(href, window.location.href);
            if (url.origin !== window.location.origin) {
                window.location.href = href;
                return;
            }

            url.searchParams.set(embeddedParam, "1");
            const shell = document.querySelector(".app-shell");
            const navigationVersion = ++embeddedNavigationVersion;
            const isLiveSearch = focusState?.live === true;
            if (isLiveSearch) {
                activeLiveSearchController?.abort();
                activeLiveSearchController = new AbortController();
            }

            const controller = isLiveSearch ? activeLiveSearchController : null;
            shell?.classList.add("is-pjax-loading");
            try {
                const response = await fetch(url.href, {
                    headers: { "X-Requested-With": "XMLHttpRequest" },
                    cache: "no-store",
                    signal: controller?.signal
                });
                if (!response.ok) {
                    throw new Error("navigation failed");
                }

                if (navigationVersion !== embeddedNavigationVersion ||
                    (isLiveSearch && activeLiveSearchController !== controller)) {
                    return;
                }

                const html = await response.text();
                if (navigationVersion !== embeddedNavigationVersion ||
                    (isLiveSearch && activeLiveSearchController !== controller)) {
                    return;
                }

                replaceEmbeddedContent(html, url.href, replaceHistory, focusState);
            } catch (error) {
                if (error?.name === "AbortError") {
                    return;
                }

                window.location.href = url.href;
            } finally {
                if (navigationVersion === embeddedNavigationVersion) {
                    shell?.classList.remove("is-pjax-loading");
                }
                if (activeLiveSearchController === controller) {
                    activeLiveSearchController = null;
                }
            }
        };

        const bindEmbeddedLinks = (root = document) => root.querySelectorAll("a[href]").forEach((link) => {
            const href = link.getAttribute("href") || "";
            if (!href || href.startsWith("#") || link.target === "_blank" || link.hasAttribute("download")) {
                return;
            }

            if (shouldUseNormalNavigation(link.href)) {
                link.addEventListener("click", (event) => {
                    event.preventDefault();
                    window.parent.location.href = link.href;
                });
                return;
            }

            try {
                link.setAttribute("href", withEmbeddedParam(link.href));
            } catch {
                return;
            }

            if (link.dataset.embeddedLinkBound) {
                return;
            }

            link.dataset.embeddedLinkBound = "1";
            link.addEventListener("click", (event) => {
                if (link.dataset.bsToggle || event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) {
                    return;
                }

                event.preventDefault();
                navigateEmbedded(link.href);
            });
        });

        bindEmbeddedLinks(document);
        bindEmbeddedForms(document);
        bindEmbeddedDirtyTracking(document);
        bindAutoCollapsibleSidePanels(document);
        postToTabHost({ type: "app-tab-content-current" });
        window.addEventListener("popstate", () => {
            navigateEmbedded(window.location.href, true);
        });

        return;
    }

    const tabList = document.querySelector("[data-app-tab-list]");
    const mainPanel = document.querySelector("[data-app-main-panel]");
    const frameStack = document.querySelector("[data-app-tab-frame-stack]");
    if (!tabList || !mainPanel || !frameStack) {
        return;
    }

    const tabs = new Map();
    let activeKey = "";

    const cleanKey = (href) => {
        const url = new URL(href, window.location.origin);
        url.searchParams.delete(embeddedParam);
        return `${url.pathname}${url.search}${url.hash}`;
    };

    const createTabFrame = (href, title) => {
        const frame = document.createElement("iframe");
        frame.className = "app-tab-frame";
        frame.loading = "eager";
        frame.src = withEmbeddedParam(href);
        frame.title = title || "صفحه";
        frameStack.appendChild(frame);
        return frame;
    };

    const syncTabStatus = (tabInfo) => {
        tabInfo.button.classList.toggle("is-stale", !!tabInfo.stale);
        tabInfo.button.classList.toggle("is-dirty", !!tabInfo.dirty);
        tabInfo.button.title = tabInfo.stale
            ? (tabInfo.dirty
                ? "اطلاعات جدید موجود است؛ ابتدا تغییرات این تب را ذخیره کنید."
                : "اطلاعات این تب هنگام ورود به‌روزرسانی می‌شود.")
            : "";
    };

    const refreshTabIfNeeded = (tabInfo) => {
        if (!tabInfo?.stale || tabInfo.dirty) {
            return;
        }

        if (tabInfo.frame) {
            tabInfo.frame.contentWindow?.location.reload();
        } else {
            tabInfo.frame = createTabFrame(tabInfo.href, tabInfo.title);
        }

        tabInfo.stale = false;
        syncTabStatus(tabInfo);
    };

    const findTabBySource = (source) => {
        for (const tabInfo of tabs.values()) {
            if (tabInfo.frame?.contentWindow === source) {
                return tabInfo;
            }
        }

        return null;
    };

    const markOtherTabsStale = (sourceTab) => {
        tabs.forEach((tabInfo) => {
            if (tabInfo === sourceTab) {
                return;
            }

            tabInfo.stale = true;
            syncTabStatus(tabInfo);
        });
    };

    const makeTabButton = ({ key, title, closeable }) => {
        const tab = document.createElement("button");
        tab.type = "button";
        tab.className = "app-tab";
        tab.dataset.appTabKey = key;
        tab.innerHTML = `<span class="app-tab__title"></span>`;
        tab.querySelector(".app-tab__title").textContent = title || "صفحه";

        if (closeable) {
            const close = document.createElement("span");
            close.className = "app-tab__close";
            close.setAttribute("role", "button");
            close.setAttribute("aria-label", "بستن تب");
            close.textContent = "×";
            tab.appendChild(close);
        }

        tab.addEventListener("click", (event) => {
            if (event.target.closest(".app-tab__close")) {
                closeTab(key);
                return;
            }

            activateTab(key);
        });

        return tab;
    };

    const activateTab = (key) => {
        if (!tabs.has(key)) {
            return;
        }

        activeKey = key;
        const activeTab = tabs.get(key);
        refreshTabIfNeeded(activeTab);
        tabs.forEach((tabInfo, tabKey) => {
            const isActive = tabKey === key;
            tabInfo.button.classList.toggle("is-active", isActive);
            if (tabInfo.frame) {
                tabInfo.frame.classList.toggle("is-active", isActive);
            }
        });

        mainPanel.classList.toggle("is-hidden", !!activeTab?.frame);
    };

    const closeTab = (key) => {
        const tabInfo = tabs.get(key);
        if (!tabInfo || key === "__dashboard__") {
            return;
        }

        const keys = [...tabs.keys()];
        const index = keys.indexOf(key);
        tabInfo.button.remove();
        tabInfo.frame?.remove();
        if (key === "__main__") {
            mainPanel.classList.add("is-hidden");
        }
        tabs.delete(key);

        if (activeKey === key) {
            const fallback = keys[index - 1] || keys[index + 1] || "__dashboard__";
            activateTab(tabs.has(fallback) ? fallback : "__dashboard__");
        }
    };

    const openTab = (href, title) => {
        const url = new URL(href, window.location.origin);
        if (url.pathname.toLowerCase() === "/home" && tabs.has("__dashboard__")) {
            activateTab("__dashboard__");
            return;
        }

        const key = cleanKey(href);
        if (tabs.has(key)) {
            activateTab(key);
            return;
        }

        const frame = createTabFrame(href, title);
        const button = makeTabButton({ key, title, closeable: true });
        tabList.appendChild(button);
        tabs.set(key, { button, frame, href: key, title: title || "صفحه", stale: false, dirty: false });
        activateTab(key);
    };

    const currentUrl = new URL(window.location.href);
    const isDashboard = currentUrl.pathname.toLowerCase() === "/home";
    const initialTitle = mainPanel.dataset.appTabTitle || document.title.replace(/\s+-\s+.*$/, "") || "داشبورد";

    if (isDashboard) {
        const dashboardButton = makeTabButton({ key: "__dashboard__", title: "داشبورد", closeable: false });
        tabList.appendChild(dashboardButton);
        tabs.set("__dashboard__", { button: dashboardButton, frame: null, href: "/Home", title: "داشبورد", stale: false, dirty: false });
        activateTab("__dashboard__");
    } else {
        const dashboardFrame = createTabFrame("/Home", "داشبورد");

        const dashboardButton = makeTabButton({ key: "__dashboard__", title: "داشبورد", closeable: false });
        tabList.appendChild(dashboardButton);
        tabs.set("__dashboard__", { button: dashboardButton, frame: dashboardFrame, href: "/Home", title: "داشبورد", stale: false, dirty: false });

        const currentButton = makeTabButton({ key: "__main__", title: initialTitle, closeable: true });
        tabList.appendChild(currentButton);
        tabs.set("__main__", { button: currentButton, frame: null, href: cleanKey(currentUrl.href), title: initialTitle, stale: false, dirty: false });
        activateTab("__main__");
    }

    window.addEventListener("message", (event) => {
        if (event.origin !== window.location.origin || !event.data?.type) {
            return;
        }

        const sourceTab = findTabBySource(event.source);
        if (!sourceTab) {
            return;
        }

        if (event.data.type === "app-tab-dirty") {
            sourceTab.dirty = !!event.data.isDirty;
            syncTabStatus(sourceTab);
            return;
        }

        if (event.data.type === "app-tab-content-current") {
            sourceTab.dirty = false;
            sourceTab.stale = false;
            syncTabStatus(sourceTab);
            return;
        }

        if (event.data.type === "app-data-changed") {
            sourceTab.dirty = false;
            sourceTab.stale = false;
            syncTabStatus(sourceTab);
            markOtherTabsStale(sourceTab);
        }
    });

    const bindTabLink = (link) => {
        if (link.dataset.appTabBound ||
            link.dataset.bsToggle ||
            link.target === "_blank" ||
            link.hasAttribute("download") ||
            shouldUseNormalNavigation(link.href) ||
            link.closest(".app-tabbar")) {
            return;
        }

        link.dataset.appTabBound = "1";
        link.addEventListener("click", (event) => {
            if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) {
                return;
            }

            const href = link.getAttribute("href") || "";
            if (!href || href.startsWith("#")) {
                return;
            }

            let url;
            try {
                url = new URL(link.href, window.location.origin);
            } catch {
                return;
            }

            if (url.origin !== window.location.origin) {
                return;
            }

            event.preventDefault();
            openTab(link.href, link.textContent.trim());
        });
    };

    document.querySelectorAll(".top-bars a[href]").forEach(bindTabLink);
    bindAutoCollapsibleSidePanels(document);

})();

document.querySelectorAll("[data-live-search-form]").forEach((form) => {
    if (form.dataset.liveSearchBound) {
        return;
    }

    form.dataset.liveSearchBound = "1";
    const input = form.querySelector("[data-live-search-input]");
    const initialValue = input?.value || "";
    const storageKey = `live-search:${window.location.pathname}:${input?.name || "query"}`;
    let submitTimer = null;

    if (input) {
        try {
        const restoreState = JSON.parse(window.sessionStorage.getItem(storageKey) || "null");
        window.sessionStorage.removeItem(storageKey);
        if (restoreState?.active) {
            window.setTimeout(() => {
                input.focus({ preventScroll: true });
                if (typeof input.setSelectionRange === "function") {
                    const cursor = Math.min(Number(restoreState.cursor ?? input.value.length), input.value.length);
                    input.setSelectionRange(cursor, cursor);
                }
                window.scrollTo(Number(restoreState.scrollX || 0), Number(restoreState.scrollY || 0));
            }, 0);
        }
        } catch {
            window.sessionStorage.removeItem(storageKey);
        }
    }

    const submit = (force = false) => {
        if (!force && input?.value === initialValue) {
            return;
        }

        if (input) {
            window.sessionStorage.setItem(storageKey, JSON.stringify({
                active: true,
                cursor: input.selectionStart,
                scrollX: window.scrollX,
                scrollY: window.scrollY
            }));
        }
        form.requestSubmit();
    };

    if (input) {
        input.addEventListener("input", () => {
            window.clearTimeout(submitTimer);
            submitTimer = window.setTimeout(submit, 550);
        });

        input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                window.clearTimeout(submitTimer);
                submit(true);
            }
        });
    }

    form.querySelectorAll("[data-live-search-submit-on-change]").forEach((control) => {
        control.addEventListener("change", () => {
            window.clearTimeout(submitTimer);
            submit(true);
        });
    });
});

const focusNextControl = (current, backwards = false) => {
    const controls = [...document.querySelectorAll("input, select, textarea, button, a[href], [tabindex]")]
        .filter((control) => {
            if (control.type === "hidden" || control.disabled) return false;
            if (control.tabIndex < 0) return false;
            if (control.closest("[hidden], .d-none")) return false;
            const style = window.getComputedStyle(control);
            return style.display !== "none" && style.visibility !== "hidden";
        });

    const index = controls.indexOf(current);
    const next = controls[index + (backwards ? -1 : 1)] || controls[backwards ? controls.length - 1 : 0];
    if (!next || next === current) return;

    next.focus();
    if (typeof next.select === "function" && next.matches("input, textarea")) {
        next.select();
    }
};

const focusAdjacentPriceTarget = (current, backwards = false) => {
    if (!current?.matches?.("[data-price-tab-target]")) {
        return false;
    }

    const inputs = [...document.querySelectorAll("[data-price-tab-target]")]
        .filter((input) => {
            if (input.disabled || input.tabIndex < 0) return false;
            if (input.closest("[hidden], .d-none")) return false;
            const style = window.getComputedStyle(input);
            return style.display !== "none" && style.visibility !== "hidden";
        });

    const index = inputs.indexOf(current);
    if (index < 0) return false;

    const nextInput = inputs[index + (backwards ? -1 : 1)];
    if (!nextInput) return true;

    nextInput.focus();
    if (typeof nextInput.select === "function") {
        nextInput.select();
    }

    return true;
};

const submitFormForControl = (control) => {
    if (control?.closest?.("[data-no-f3]")) {
        return false;
    }

    const formId = control?.getAttribute?.("form");
    const form = formId ? document.getElementById(formId) : control?.closest?.("form");
    if (!form || form.method?.toLowerCase() !== "post") {
        return false;
    }

    const action = form.getAttribute("action") || "";
    const hasDangerSubmit = !!form.querySelector("button[type='submit'].btn-danger, button[type='submit'].btn-outline-danger");
    if (form.classList.contains("danger-zone") ||
        form.id?.startsWith("delete-") ||
        /handler=(delete|deletediscount)/i.test(action) ||
        hasDangerSubmit) {
        return false;
    }

    const isFocusedSubmit =
        control?.matches?.("button[type='submit'], input[type='submit']") &&
        !control.disabled;
    if (isFocusedSubmit) {
        control.click();
        return true;
    }

    if (typeof form.requestSubmit === "function") {
        form.requestSubmit();
    } else {
        form.submit();
    }

    return true;
};

document.addEventListener("keydown", (event) => {
    if (event.key === "F3") {
        if (submitFormForControl(document.activeElement)) {
            event.preventDefault();
        }
        return;
    }

    if (event.key !== "Enter" || event.ctrlKey || event.altKey || event.metaKey) {
        return;
    }

    const target = event.target;
    if (!(target instanceof HTMLElement)) {
        return;
    }

    if (target.closest("[data-enter-submit]")) {
        return;
    }

    if (target.matches("textarea, button, [type='submit'], [type='button'], a[href]") ||
        target.closest(".product-combobox") ||
        target.matches("[data-live-search-input]")) {
        return;
    }

    if (focusAdjacentPriceTarget(target, event.shiftKey)) {
        event.preventDefault();
        return;
    }

    event.preventDefault();
    focusNextControl(target, event.shiftKey);
}, true);

const applyReadonlyScope = (scope) => {
    scope.querySelectorAll("input, textarea").forEach((control) => {
        if (control.type === "hidden") return;

        if (control.type === "checkbox" || control.type === "radio" || control.type === "file") {
            control.disabled = true;
        } else {
            control.readOnly = true;
        }

        control.classList.add("is-readonly");
    });

    scope.querySelectorAll("select, button").forEach((control) => {
        control.disabled = true;
        control.classList.add("is-readonly");
    });

    scope.querySelectorAll("a.btn, .row-actions a, .action-link").forEach((link) => {
        link.classList.add("disabled", "is-readonly");
        link.setAttribute("aria-disabled", "true");
        link.addEventListener("click", (event) => event.preventDefault());
    });
};

if (document.body.classList.contains("view-only")) {
    document.querySelectorAll("form[method='post']").forEach((form) => {
        applyReadonlyScope(form);
        if (!form.id) return;

        document.querySelectorAll(`[form='${CSS.escape(form.id)}']`).forEach((control) => {
            if (control.matches("input, textarea")) {
                if (control.type === "hidden") return;

                if (control.type === "checkbox" || control.type === "radio" || control.type === "file") {
                    control.disabled = true;
                } else {
                    control.readOnly = true;
                }
            } else {
                control.disabled = true;
            }

            control.classList.add("is-readonly");
        });
    });
    document.querySelectorAll("button[form]").forEach((button) => {
        const form = document.getElementById(button.getAttribute("form"));
        if (form?.method?.toLowerCase() === "post") {
            button.disabled = true;
            button.classList.add("is-readonly");
        }
    });
}

document.querySelectorAll(".readonly-scope").forEach(applyReadonlyScope);

document.querySelectorAll("[data-number-format='money']").forEach((input) => {
    const format = (roundToStep = false) => {
        if (!roundToStep) {
            input.value = formatMoneyWhileTyping(input.value, input);
            return;
        }

        const value = roundToInputStep(input.value, input);
        input.value = formatMoneyValue(value, input);
    };

    input.addEventListener("input", () => {
        const caretWasAtEnd = input.selectionStart === input.value.length;
        format();
        if (caretWasAtEnd) {
            input.setSelectionRange(input.value.length, input.value.length);
        }
    });

    input.addEventListener("blur", () => format(true));
    format(true);
});

document.querySelectorAll("form").forEach((form) => {
    form.addEventListener("submit", () => {
        const associatedInputs = form.id
            ? document.querySelectorAll(`[data-number-format='money'][form='${CSS.escape(form.id)}']`)
            : [];

        [...form.querySelectorAll("[data-number-format='money']"), ...associatedInputs].forEach((input) => {
            input.value = String(roundToInputStep(input.value, input));
        });
    });
});

document.querySelectorAll("[data-price-tab-target]").forEach((input, index, inputs) => {
    input.addEventListener("keydown", (event) => {
        if (event.key !== "Tab") return;

        const nextIndex = event.shiftKey ? index - 1 : index + 1;
        const nextInput = inputs[nextIndex];
        if (!nextInput) return;

        event.preventDefault();
        nextInput.focus();
        nextInput.select();
    });
});

document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-factory-edit-toggle]");
    if (!button) return;

    const panel = button.closest(".factory-price-panel");
    if (!panel) return;

    const isEditing = panel.classList.toggle("factory-price-panel--editing");
    button.textContent = isEditing ? "بستن ویرایش" : "ویرایش قیمت‌ها";
    if (isEditing) {
        panel.querySelector("[data-factory-price-input]")?.focus();
    }
});

document.querySelectorAll(".table-price-input[data-original-price]").forEach((input) => {
    const badge = input.closest(".price-edit-cell")?.querySelector(".price-diff-badge");
    const originalPrice = parseGroupedNumber(input.dataset.originalPrice);
    if (!badge || originalPrice <= 0) return;

    const updateDiff = () => {
        const currentPrice = parseGroupedNumber(input.value);
        const difference = currentPrice - originalPrice;
        const percent = Math.abs(difference) / originalPrice * 100;

        badge.classList.remove("is-up", "is-down");

        if (difference === 0 || !Number.isFinite(percent)) {
            badge.style.display = "none";
            badge.textContent = "";
            return;
        }

        badge.textContent = `${percent.toLocaleString("en-US", {
            maximumFractionDigits: 1,
            minimumFractionDigits: percent < 1 ? 1 : 0
        })}%`;
        badge.classList.add(difference > 0 ? "is-up" : "is-down");
        badge.style.display = "inline-block";
    };

    input.addEventListener("input", updateDiff);
    input.addEventListener("blur", updateDiff);
    updateDiff();
});

bindFactoryPriceInputs(document);

document.querySelectorAll("[data-product-combobox]").forEach((combo) => {
    const form = combo.closest("form");
    const search = combo.querySelector(".js-product-search");
    const hidden = combo.querySelector(".js-product-code");
    const toggle = combo.querySelector(".product-combobox__toggle");
    const options = [...combo.querySelectorAll(".product-combobox__option")];

    const open = () => {
        const rect = combo.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        combo.classList.toggle("product-combobox--drop-up", spaceBelow < 280 && rect.top > spaceBelow);
        combo.classList.add("open");
        search.setAttribute("aria-expanded", "true");
    };

    const close = () => {
        combo.classList.remove("open");
        combo.classList.remove("product-combobox--drop-up");
        search.setAttribute("aria-expanded", "false");
    };

    const filter = () => {
        const term = search.value;
        options.forEach((option) => {
            const haystack = `${option.dataset.productCode || ""} ${option.dataset.productLabel || ""}`;
            option.hidden = !searchMatches(haystack, term);
        });
    };

    const choose = (option) => {
        hidden.value = option.dataset.productCode || "";
        search.value = option.dataset.productLabel || option.dataset.productCode || "";
        if (typeof form?.requestSubmit === "function") {
            form.requestSubmit();
        } else {
            form?.submit();
        }
    };

    search.addEventListener("focus", () => {
        filter();
        open();
    });

    search.addEventListener("input", () => {
        hidden.value = "";
        filter();
        open();
    });

    search.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            const firstVisible = options.find((option) => !option.hidden);
            if (firstVisible) {
                choose(firstVisible);
            }
        }

        if (event.key === "Escape") {
            close();
        }
    });

    toggle.addEventListener("click", () => {
        filter();
        combo.classList.contains("open") ? close() : open();
        search.focus();
    });

    options.forEach((option) => {
        option.addEventListener("click", () => choose(option));
    });

    document.addEventListener("click", (event) => {
        if (!combo.contains(event.target)) {
            close();
        }
    });
});

document.querySelectorAll("[data-material-combobox]").forEach((combo) => {
    const search = combo.querySelector(".js-material-search");
    const hidden = combo.querySelector(".js-material-name");
    const toggle = combo.querySelector(".product-combobox__toggle");
    const refresh = combo.querySelector(".product-combobox__refresh");
    const optionsContainer = combo.querySelector(".product-combobox__options");
    const getOptions = () => [...combo.querySelectorAll(".product-combobox__option")];
    let refreshPromise = null;
    let liveRefreshCompleted = false;

    const open = () => {
        const rect = combo.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        combo.classList.toggle("product-combobox--drop-up", spaceBelow < 280 && rect.top > spaceBelow);
        combo.classList.add("open");
        search.setAttribute("aria-expanded", "true");
    };

    const close = () => {
        combo.classList.remove("open");
        combo.classList.remove("product-combobox--drop-up");
        search.setAttribute("aria-expanded", "false");
    };

    const filter = () => {
        const term = search.value;
        getOptions().forEach((option) => {
            const haystack = `${option.dataset.materialName || ""} ${option.dataset.materialLabel || ""}`;
            option.hidden = !searchMatches(haystack, term);
        });
    };

    const choose = (option) => {
        hidden.value = option.dataset.materialName || "";
        search.value = option.dataset.materialLabel || hidden.value;
        combo.dispatchEvent(new CustomEvent("material:selected", { detail: { option } }));
        close();
    };

    const refreshOptions = () => {
        const refreshUrl = combo.dataset.materialRefreshUrl;
        if (!refreshUrl || !optionsContainer) {
            return Promise.resolve(false);
        }
        if (refreshPromise) {
            return refreshPromise;
        }

        const selectedValue = hidden.value;
        const selectedOption = getOptions().find((option) => option.dataset.materialName === selectedValue);
        if (refresh) {
            refresh.disabled = true;
            refresh.classList.remove("has-error");
            refresh.classList.add("is-loading");
            refresh.title = "در حال به‌روزرسانی...";
        }

        refreshPromise = fetch(refreshUrl, {
            headers: { "Accept": "application/json" },
            cache: "no-store"
        }).then((response) => {
            if (!response.ok) {
                throw new Error("refresh failed");
            }
            return response.json();
        }).then((materials) => {
            optionsContainer.replaceChildren(...materials.map((material) => {
                const option = document.createElement("button");
                option.type = "button";
                option.className = "product-combobox__option";
                option.dataset.materialName = material.value;
                option.dataset.materialLabel = material.label;
                option.dataset.materialPrice = String(material.price ?? 0);
                option.dataset.materialUnit = material.unit || "—";
                option.textContent = material.label;
                return option;
            }));

            if (selectedValue && !getOptions().some((option) => option.dataset.materialName === selectedValue) && selectedOption) {
                optionsContainer.prepend(selectedOption.cloneNode(true));
            }

            filter();
            open();
            combo.dispatchEvent(new CustomEvent("materials:refreshed"));
            if (refresh) {
                refresh.title = "فهرست به‌روزرسانی شد";
            }
            return true;
        }).catch(() => {
            if (refresh) {
                refresh.title = "به‌روزرسانی فهرست انجام نشد";
                refresh.classList.add("has-error");
            }
            return false;
        }).finally(() => {
            if (refresh) {
                refresh.disabled = false;
                refresh.classList.remove("is-loading");
            }
            refreshPromise = null;
        });

        return refreshPromise;
    };

    search.addEventListener("focus", async () => {
        filter();
        open();
        if (combo.dataset.materialLiveRefresh === "true" && !liveRefreshCompleted) {
            liveRefreshCompleted = await refreshOptions();
        }
    });

    search.addEventListener("input", () => {
        hidden.value = "";
        filter();
        open();
    });

    search.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            const firstVisible = getOptions().find((option) => !option.hidden);
            if (firstVisible) {
                choose(firstVisible);
            }
        }

        if (event.key === "Escape") {
            close();
        }
    });

    toggle.addEventListener("click", () => {
        filter();
        combo.classList.contains("open") ? close() : open();
        search.focus();
    });

    optionsContainer?.addEventListener("click", (event) => {
        const option = event.target.closest(".product-combobox__option");
        if (option && optionsContainer.contains(option)) {
            choose(option);
        }
    });

    refresh?.addEventListener("click", async () => {
        await refreshOptions();
        search.focus();
        search.select();
    });

    document.addEventListener("click", (event) => {
        if (!combo.contains(event.target)) {
            close();
        }
    });
});

document.querySelectorAll("[data-copy-product-combobox]").forEach((combo) => {
    const search = combo.querySelector(".js-copy-product-search");
    const hidden = combo.querySelector(".js-copy-product-id");
    const toggle = combo.querySelector(".product-combobox__toggle");
    const options = [...combo.querySelectorAll(".product-combobox__option")];

    const open = () => {
        combo.classList.add("open");
        search.setAttribute("aria-expanded", "true");
    };

    const close = () => {
        combo.classList.remove("open");
        search.setAttribute("aria-expanded", "false");
    };

    const filter = () => {
        const term = search.value;
        options.forEach((option) => {
            const haystack = `${option.dataset.productCode || ""} ${option.dataset.productLabel || ""}`;
            option.hidden = !searchMatches(haystack, term);
        });
    };

    const choose = (option) => {
        hidden.value = option.dataset.productId || "";
        search.value = option.dataset.productLabel || option.dataset.productCode || "";
        close();
    };

    search.addEventListener("focus", () => {
        filter();
        open();
    });

    search.addEventListener("input", () => {
        hidden.value = "";
        filter();
        open();
    });

    search.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            const firstVisible = options.find((option) => !option.hidden);
            if (firstVisible) {
                choose(firstVisible);
            }
        }

        if (event.key === "Escape") {
            close();
        }
    });

    toggle.addEventListener("click", () => {
        filter();
        combo.classList.contains("open") ? close() : open();
        search.focus();
    });

    options.forEach((option) => {
        option.addEventListener("click", () => choose(option));
    });

    document.addEventListener("click", (event) => {
        if (!combo.contains(event.target)) {
            close();
        }
    });
});
