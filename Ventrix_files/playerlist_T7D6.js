document.addEventListener("DOMContentLoaded", () => {

    const gridElement = document.getElementById("myGrid");

    if (!gridElement || typeof agGrid === "undefined") {
        return;
    }


    // =========================================================
    // RANGO (división de Ranked Play)
    //   0 Unranked | 1-3 Bronce | 4-6 Plata | 7-9 Oro | 10-12 Diamante
    //   13-15 Crimson | 16 Iridiscente | 17 Top 250
    // =========================================================

    const RANK_NAMES = [
        "Unranked",
        "Bronce 1", "Bronce 2", "Bronce 3",
        "Plata 1", "Plata 2", "Plata 3",
        "Oro 1", "Oro 2", "Oro 3",
        "Diamante 1", "Diamante 2", "Diamante 3",
        "Crimson 1", "Crimson 2", "Crimson 3",
        "Iridiscente",
        "Top 250"
    ];

    const rankName = v => RANK_NAMES[Number(v)] || "Unranked";


    // =========================================================
    // COLUMNAS
    // =========================================================

    // Titulos de columna traducidos (nombre + clave i18n + campo)
    const COL_LANG = {};
    function colL(key, fallback, field) {
        if (field) COL_LANG[field] = { key, fallback };
        return (typeof t === "function") ? t(key) : fallback;
    }

    const columnDefs = [
        {
            field: "rank",
            headerName: colL("colRank", "Rango", "rank"),
            width: 130,
            minWidth: 110,
            filter: "agTextColumnFilter",
            valueFormatter: p => rankName(p.value),
            filterValueGetter: p => rankName(p.data ? p.data.rank : p.value)
        },
        {
            field: "username",
            headerName: colL("colUsername", "Nombre de usuario", "username"),
            width: 180,
            minWidth: 150,
            filter: "agTextColumnFilter",
            cellClass: "player-name"
        },
        {
            field: "clan",
            headerName: colL("colClan", "Clan", "clan"),
            width: 90,
            minWidth: 70,
            filter: "agTextColumnFilter",
            cellClass: "player-clan"
        },
        {
            field: "platform",
            headerName: colL("colPlatform", "Plataforma", "platform"),
            width: 130,
            minWidth: 110,
            filter: "agTextColumnFilter",
            cellClass: "player-platform"
        },
        {
            field: "input",
            headerName: colL("colInput", "Input", "input"),
            width: 110,
            minWidth: 90,
            filter: "agTextColumnFilter"
        },
        {
            field: "status",
            headerName: colL("colStatus", "Estado", "status"),
            width: 110,
            minWidth: 90,
            filter: "agTextColumnFilter"
        },
        {
            field: "teamId",
            headerName: colL("colTeam", "ID de equipo", "teamId"),
            width: 130,
            minWidth: 110,
            filter: "agTextColumnFilter"
        },
        {
            field: "eliminations",
            headerName: colL("colKills", "Eliminaciones", "eliminations"),
            width: 130,
            minWidth: 110,
            filter: "agNumberColumnFilter"
        },
        {
            field: "deaths",
            headerName: colL("colDeaths", "Deaths", "deaths"),
            width: 100,
            minWidth: 85,
            filter: "agNumberColumnFilter"
        },
        {
            field: "level",
            headerName: colL("colLevel", "Nivel", "level"),
            width: 90,
            minWidth: 80,
            filter: "agNumberColumnFilter"
        },
        {
            field: "ping",
            headerName: colL("colPing", "Ping", "ping"),
            width: 90,
            minWidth: 75,
            filter: "agNumberColumnFilter",
            cellClass: "player-ping"
        },
        {
            field: "index",
            headerName: colL("colIndex", "Index", "index"),
            width: 100,
            minWidth: 80,
            filter: "agNumberColumnFilter",
            hide: true
        },
        {
            field: "xuid",
            headerName: colL("colXuid", "XUID", "xuid"),
            width: 180,
            minWidth: 150,
            filter: "agTextColumnFilter",
            hide: true
        }
    ];


    // =========================================================
    // GRID
    // =========================================================

    const gridOptions = {

        columnDefs: columnDefs,

        rowData: [],

        defaultColDef: {
            sortable: true,
            resizable: true,
            filter: true,
            suppressHeaderMenuButton: false
        },

        rowHeight: 42,

        headerHeight: 48,

        animateRows: false,

        // Sin esto, cada vez que C++ manda la lista de players ag-Grid
        // vuelve a subir el scroll arriba.
        suppressScrollOnNewData: true,

        suppressCellFocus: true,

        // ── Filtros EXTERNOS ──
        // SOLO afectan a lo que se VE en la tabla (visual). No tocan el ESP,
        // el aim ni nada del cheat: el C++ sigue recibiendo todo igual.
        isExternalFilterPresent: () => {
            const f = window.playersFilters || {};
            return !!(f.top250 || f.hideDead || f.hideLocal || f.hideBots || f.hideOutOfGame);
        },
        doesExternalFilterPass: node => {
            const f = window.playersFilters || {};
            const d = node.data || {};

            if (f.top250 && Number(d.rank) !== 17) return false;                        // solo Top 250
            if (f.hideDead && String(d.status || "").toLowerCase() === "dead") return false;
            if (f.hideLocal && (d.kind === "local" || Number(d.index) === -1)) return false;
            if (f.hideBots && d.isBot) return false;
            if (f.hideOutOfGame) {
                const st = String(d.status || "").toLowerCase();
                if (st !== "alive" && st !== "dead") return false;
            }
            return true;
        },

        // Permitir mover columnas desde AG Grid
        suppressMovableColumns: false,

        overlayNoRowsTemplate:
            '<span class="ag-overlay-no-rows-center">No players to show yet...</span>',

        onGridReady: params => {

            window.playersGridApi = params.api;

            buildColumnsPanel(params.api);
        }
    };


    const gridApi = agGrid.createGrid(
        gridElement,
        gridOptions
    );

    // Re-traduce los titulos al cambiar de idioma (mantiene el orden de columnas)
    window.refreshPlayersGridLang = () => {
        try {
            const state = (gridApi && gridApi.getColumnState) ? gridApi.getColumnState() : null;
            columnDefs.forEach(c => {
                const m = COL_LANG[c.field];
                if (m) c.headerName = (typeof t === "function") ? t(m.key) : m.fallback;
            });
            gridApi.setGridOption("columnDefs", columnDefs);
            if (state && gridApi.applyColumnState) gridApi.applyColumnState({ state, applyOrder: true });
        } catch (_) {}
    };


    // =========================================================
    // ELEMENTOS DEL PANEL
    // =========================================================

    const columnsToggle =
        document.getElementById("columnsToggle");

    const columnsPanel =
        document.getElementById("columnsPanel");

    const columnsClose =
        document.getElementById("columnsClose");

    const columnsList =
        document.getElementById("columnsList");


    // =========================================================
    // ABRIR / CERRAR PANEL
    // =========================================================

    columnsToggle?.addEventListener("click", event => {

        event.stopPropagation();

        columnsPanel?.classList.toggle("open");
    });


    columnsClose?.addEventListener("click", event => {

        event.stopPropagation();

        columnsPanel?.classList.remove("open");
    });


    // =========================================================
    // ESTADO DEL DRAG
    // =========================================================

    let draggedItem = null;
    let draggedColId = null;
    let dragStartY = 0;
    let isDragging = false;

    // IMPORTANTE:
    // evita que pointerup + click cambien el checkbox
    let suppressClick = false;


    // =========================================================
    // CONSTRUIR PANEL
    // =========================================================

    function buildColumnsPanel(api) {

        if (!columnsList) {
            return;
        }

        columnsList.innerHTML = "";


        // Obtener el orden REAL de AG Grid
        const columns =
            api.getAllGridColumns
                ? api.getAllGridColumns()
                : api.getColumns();


        if (!columns || !columns.length) {
            return;
        }


        columns.forEach((column, index) => {

            const col = column.getColDef();

            const colId = column.getColId();


            // -------------------------------------------------
            // ITEM
            // -------------------------------------------------

            const item =
                document.createElement("div");

            item.className = "column-item";

            item.dataset.field =
                col.field || "";

            item.dataset.colId =
                colId;


            // -------------------------------------------------
            // CHECKBOX
            // -------------------------------------------------

            const checkbox =
                document.createElement("input");

            checkbox.type = "checkbox";

            checkbox.className =
                "column-checkbox";

            // SIEMPRE usar el estado real de AG Grid
            checkbox.checked =
                column.isVisible();


            // -------------------------------------------------
            // CHECKBOX CLICK
            // -------------------------------------------------

            checkbox.addEventListener("click", event => {

                event.stopPropagation();

                // Nunca iniciar drag
                isDragging = false;
            });


            // -------------------------------------------------
            // CHECKBOX CHANGE
            // -------------------------------------------------

            checkbox.addEventListener("change", event => {

                event.stopPropagation();

                api.setColumnsVisible(
                    [colId],
                    checkbox.checked
                );
            });


            // -------------------------------------------------
            // ICONO DRAG
            // -------------------------------------------------

            const drag =
                document.createElement("span");

            drag.className =
                "column-drag";


            // -------------------------------------------------
            // NOMBRE
            // -------------------------------------------------

            const name =
                document.createElement("span");

            name.className =
                "column-name";

            name.textContent =
                col.headerName ||
                col.field ||
                colId;


            item.append(
                checkbox,
                drag,
                name
            );


            // =================================================
            // POINTER DOWN
            // =================================================

            item.addEventListener(
                "pointerdown",
                event => {

                    // Solo botón izquierdo
                    if (event.button !== 0) {
                        return;
                    }

                    // Checkbox no arrastra
                    if (
                        event.target === checkbox ||
                        event.target.closest(".column-checkbox")
                    ) {
                        return;
                    }


                    draggedItem = item;

                    draggedColId = colId;

                    dragStartY =
                        event.clientY;

                    isDragging = false;

                    suppressClick = false;


                    // Capturar puntero
                    try {
                        item.setPointerCapture(
                            event.pointerId
                        );
                    } catch (_) {}


                    event.preventDefault();
                }
            );


            // =================================================
            // POINTER MOVE
            // =================================================

            item.addEventListener(
                "pointermove",
                event => {

                    if (
                        draggedItem !== item
                    ) {
                        return;
                    }


                    const distance =
                        Math.abs(
                            event.clientY -
                            dragStartY
                        );


                    // Umbral para distinguir click de drag
                    if (
                        !isDragging &&
                        distance < 5
                    ) {
                        return;
                    }


                    // Comenzó realmente el drag
                    if (!isDragging) {

                        isDragging = true;

                        suppressClick = true;

                        item.classList.add(
                            "dragging"
                        );

                        columnsList
                            .querySelectorAll(
                                ".column-item"
                            )
                            .forEach(el => {

                                el.classList.remove(
                                    "drag-over"
                                );
                            });
                    }


                    const target =
                        getDropTarget(
                            event.clientY,
                            item
                        );


                    columnsList
                        .querySelectorAll(
                            ".column-item"
                        )
                        .forEach(el => {

                            el.classList.remove(
                                "drag-over"
                            );
                        });


                    if (
                        target &&
                        target !== item
                    ) {

                        target.classList.add(
                            "drag-over"
                        );
                    }
                }
            );


            // =================================================
            // POINTER UP
            // =================================================

            item.addEventListener(
                "pointerup",
                event => {

                    if (
                        draggedItem !== item
                    ) {
                        return;
                    }


                    // -----------------------------------------
                    // SI FUE DRAG
                    // -----------------------------------------

                    if (isDragging) {

                        suppressClick = true;


                        const target =
                            getDropTarget(
                                event.clientY,
                                item
                            );


                        item.classList.remove(
                            "dragging"
                        );


                        columnsList
                            .querySelectorAll(
                                ".column-item"
                            )
                            .forEach(el => {

                                el.classList.remove(
                                    "drag-over"
                                );
                            });


                        if (
                            target &&
                            target !== item
                        ) {

                            moveColumn(
                                api,
                                draggedColId,
                                target.dataset.colId,
                                event.clientY
                            );
                        }
                    }


                    // -----------------------------------------
                    // LIBERAR
                    // -----------------------------------------

                    try {

                        item.releasePointerCapture(
                            event.pointerId
                        );

                    } catch (_) {}


                    draggedItem = null;

                    draggedColId = null;

                    isDragging = false;


                    // Mantener suppressClick durante
                    // el click que genera pointerup
                    if (suppressClick) {

                        setTimeout(() => {

                            suppressClick = false;

                        }, 50);
                    }
                }
            );


            // =================================================
            // POINTER CANCEL
            // =================================================

            item.addEventListener(
                "pointercancel",
                event => {

                    item.classList.remove(
                        "dragging"
                    );


                    columnsList
                        .querySelectorAll(
                            ".column-item"
                        )
                        .forEach(el => {

                            el.classList.remove(
                                "drag-over"
                            );
                        });


                    try {

                        item.releasePointerCapture(
                            event.pointerId
                        );

                    } catch (_) {}


                    draggedItem = null;

                    draggedColId = null;

                    isDragging = false;

                    suppressClick = true;


                    setTimeout(() => {

                        suppressClick = false;

                    }, 50);
                }
            );


            // =================================================
            // CLICK DEL ITEM
            // =================================================

            item.addEventListener(
                "click",
                event => {

                    // Checkbox ya maneja su propio click
                    if (
                        event.target === checkbox ||
                        event.target.closest(".column-checkbox")
                    ) {
                        return;
                    }


                    // -----------------------------------------
                    // CRÍTICO:
                    // si hubo drag NO cambiar visibilidad
                    // -----------------------------------------

                    if (suppressClick) {

                        event.preventDefault();

                        event.stopPropagation();

                        return;
                    }


                    // -----------------------------------------
                    // CLICK NORMAL
                    // -----------------------------------------

                    checkbox.checked =
                        !checkbox.checked;


                    api.setColumnsVisible(
                        [colId],
                        checkbox.checked
                    );
                }
            );


            columnsList.appendChild(item);
        });
    }


    // =========================================================
    // BUSCAR DESTINO DEL DRAG
    // =========================================================

    function getDropTarget(
        mouseY,
        draggedElement
    ) {

        const items =
            [
                ...columnsList.querySelectorAll(
                    ".column-item"
                )
            ].filter(
                item => item !== draggedElement
            );


        let closest = null;

        let closestDistance =
            Infinity;


        for (const item of items) {

            const rect =
                item.getBoundingClientRect();


            const centerY =
                rect.top +
                rect.height / 2;


            const distance =
                Math.abs(
                    mouseY - centerY
                );


            if (
                distance <
                closestDistance
            ) {

                closestDistance =
                    distance;

                closest =
                    item;
            }
        }


        return closest;
    }


    // =========================================================
    // MOVER COLUMNA
    // =========================================================

    function moveColumn(
        api,
        draggedColId,
        targetColId,
        mouseY
    ) {

        const columns =
            api.getAllGridColumns
                ? api.getAllGridColumns()
                : api.getColumns();


        if (
            !columns ||
            !columns.length
        ) {
            return;
        }


        // -----------------------------------------
        // GUARDAR ESTADO DE VISIBILIDAD
        // -----------------------------------------

        const visibility = {};

        columns.forEach(column => {

            visibility[
                column.getColId()
            ] =
                column.isVisible();
        });


        // -----------------------------------------
        // ORDEN ACTUAL
        // -----------------------------------------

        const order =
            columns.map(
                column =>
                    column.getColId()
            );


        const fromIndex =
            order.indexOf(
                draggedColId
            );


        const targetIndex =
            order.indexOf(
                targetColId
            );


        if (
            fromIndex === -1 ||
            targetIndex === -1 ||
            fromIndex === targetIndex
        ) {
            return;
        }


        // -----------------------------------------
        // CALCULAR POSICIÓN
        // -----------------------------------------

        const targetElement =
            columnsList.querySelector(
                `[data-col-id="${CSS.escape(targetColId)}"]`
            );


        let insertIndex =
            targetIndex;


        if (targetElement) {

            const rect =
                targetElement.getBoundingClientRect();


            const center =
                rect.top +
                rect.height / 2;


            if (
                mouseY >
                center
            ) {

                insertIndex++;
            }
        }


        // -----------------------------------------
        // ELIMINAR COLUMNA ORIGINAL
        // -----------------------------------------

        order.splice(
            fromIndex,
            1
        );


        // Ajustar índice
        if (
            fromIndex <
            insertIndex
        ) {

            insertIndex--;
        }


        // -----------------------------------------
        // INSERTAR
        // -----------------------------------------

        order.splice(
            insertIndex,
            0,
            draggedColId
        );


        // -----------------------------------------
        // APLICAR ORDEN
        // -----------------------------------------

        api.applyColumnState({

            state:
                order.map(
                    (colId, index) => ({
                        colId: colId,
                        order: index
                    })
                ),

            applyOrder: true
        });


        // -----------------------------------------
        // RESTAURAR VISIBILIDAD
        // -----------------------------------------

        Object.entries(
            visibility
        ).forEach(
            ([colId, visible]) => {

                api.setColumnsVisible(
                    [colId],
                    visible
                );
            }
        );


        // -----------------------------------------
        // RECONSTRUIR PANEL
        // -----------------------------------------

        requestAnimationFrame(() => {

            buildColumnsPanel(api);
        });
    }


    // =========================================================
    // EVENTOS DE AG GRID
    // =========================================================

    gridApi.addEventListener(
        "columnVisible",
        () => {

            // Si estamos arrastrando no reconstruir
            // el panel en mitad del drag.
            if (isDragging) {
                return;
            }

            buildColumnsPanel(gridApi);
        }
    );


    gridApi.addEventListener(
        "columnMoved",
        () => {

            if (isDragging) {
                return;
            }

            buildColumnsPanel(gridApi);
        }
    );


    // =========================================================
    // PLAYERS
    // =========================================================

    window.setPlayers = players => {

        if (!Array.isArray(players)) {
            return;
        }


        gridApi.setGridOption(
            "rowData",
            players
        );


        updateStats(players);
    };


    // =========================================================
    // ESTADÍSTICAS
    // =========================================================

    function updateStats(players) {

        // -----------------------------------------
        // VIVOS
        // -----------------------------------------

        const alive =
            players.filter(p => {

                const status =
                    String(
                        p.status || ""
                    ).toLowerCase();

                return (
                    status === "alive" ||
                    status === "vivo"
                );
            }).length;


        // -----------------------------------------
        // PC
        // -----------------------------------------

        const pc =
            players.filter(p => {

                return String(
                    p.platform || ""
                ).toLowerCase() === "pc";

            }).length;


        // -----------------------------------------
        // CONSOLA
        // -----------------------------------------

        const consoleCount =
            players.filter(p => {

                const platform =
                    String(
                        p.platform || ""
                    ).toLowerCase();


                return (
                    platform.includes("console") ||
                    platform.includes("xbox") ||
                    platform.includes("playstation") ||
                    platform.includes("ps")
                );

            }).length;


        // -----------------------------------------
        // K/D
        // -----------------------------------------

        const kdValues =
            players
                .map(
                    p => Number(p.ratio)
                )
                .filter(
                    Number.isFinite
                );


        const kd =
            kdValues.length
                ? kdValues.reduce(
                    (a, b) => a + b,
                    0
                ) / kdValues.length
                : 0;


        // -----------------------------------------
        // SR
        // -----------------------------------------

        const srValues =
            players
                .map(
                    p => Number(p.sr)
                )
                .filter(
                    Number.isFinite
                );


        const sr =
            srValues.length
                ? srValues.reduce(
                    (a, b) => a + b,
                    0
                ) / srValues.length
                : 0;


        // -----------------------------------------
        // MOSTRAR
        // -----------------------------------------

        setText(
            "avgKD",
            kd.toFixed(2)
        );

        setText(
            "avgSR",
            Math.round(sr)
        );

        setText(
            "aliveCount",
            alive
        );

        setText(
            "pcCount",
            pc
        );

        setText(
            "consoleCount",
            consoleCount
        );
    }


    // =========================================================
    // SET TEXT
    // =========================================================

    function setText(
        id,
        value
    ) {

        const element =
            document.getElementById(id);


        if (element) {

            element.textContent =
                value;
        }
    }


    // =========================================================
    // FILTROS
    // =========================================================

    function applyFilters() {

        window.playersFilters = {

            groupTeams:
                document.getElementById(
                    "groupTeams"
                )?.checked,

            hideDead:
                document.getElementById(
                    "hideDead"
                )?.checked,

            hideLocal:
                document.getElementById(
                    "hideLocal"
                )?.checked,

            hideBots:
                document.getElementById(
                    "hideBots"
                )?.checked,

            hideOutOfGame:
                document.getElementById(
                    "hideOutOfGame"
                )?.checked,

            top250:
                document.getElementById(
                    "top250Only"
                )?.checked
        };

        // Re-evaluar el filtro externo (Solo Top 250)
        if (gridApi && typeof gridApi.onFilterChanged === "function")
            gridApi.onFilterChanged();
    }


    [
        "groupTeams",
        "hideDead",
        "hideLocal",
        "hideBots",
        "hideOutOfGame",
        "top250Only"

    ].forEach(id => {

        document
            .getElementById(id)
            ?.addEventListener(
                "change",
                applyFilters
            );
    });


    // Estado inicial de los filtros (los checks del HTML vienen marcados
    // por defecto, ej. "Ocultar bots"). Solo afecta a la tabla.
    applyFilters();


    // =========================================================
    // API GLOBAL
    // =========================================================

    window.getPlayersGrid =
        () => gridApi;

});