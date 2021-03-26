$(document).ready(
    function () {

        // Define global variables

        let isDragging = false;
        let saveDragPos;

        let mouseOverHighlight = false;
        let mouseMovedAfterClick = false;  // Avoids immediately triggering hover event after selecting summary

        let rtime;
        let timeout = false;
        let delta = 200;

        let disableScrollEvent = false;

        let showLexical = false;
        let showSemantic = false;
        let showEntities = false;

        // Define functions

        function clamp(number, min, max) {
            return Math.max(min, Math.min(number, max));
        }

        function hasScroll() {
            const el = $(".display .main-doc");
            return el.prop("scrollHeight") > el.prop("clientHeight");
        }

        function scrollBy(delta) {
            const proxyDoc = $(".display .proxy-doc");
            const proxyScroll = proxyDoc.find(".proxy-scroll");
            const currentTop = parseFloat(proxyScroll.css("top"));
            const newTop = clamp(currentTop + delta, 0, proxyDoc.innerHeight() - proxyScroll.innerHeight());
            proxyScroll.css("top", newTop);
            const mainDoc = $(".display .main-doc");
            const scaleY = mainDoc[0].scrollHeight / proxyDoc.innerHeight();
            mainDoc.scrollTop(newTop * scaleY)
        }

        function createProxy() {
            const mainDoc = $(".display .main-doc");
            const proxyDoc = $(".display .proxy-doc");
            const proxyHeight = proxyDoc.innerHeight();
            const proxyWidth = proxyDoc.innerWidth();
            const scaleX = 0.8 * proxyWidth / mainDoc.innerWidth();
            const scaleY = proxyHeight / mainDoc[0].scrollHeight;
            const scrollTop = mainDoc.scrollTop();
            const proxyScrollTop = scrollTop * scaleY;
            const proxyScrollBottom = (scrollTop + mainDoc.innerHeight()) * scaleY;
            const proxyScrollHeight = proxyScrollBottom - proxyScrollTop;
            proxyDoc.empty();

            // Loop through underlines in doc view and create associated proxy element
            if (showLexical) {
                $(".display .main-doc .token-underline").each(
                    function (index, value) {
                        const el = $(value);
                        const x = el.position().left;
                        const y = mainDoc.scrollTop() + el.position().top - mainDoc.position().top;
                        const newHeight = 3;
                        const color = el.css("border-bottom-color");
                        const proxyPadding = proxyDoc.innerWidth() - proxyDoc.width();
                        const newX = x * scaleX + proxyPadding / 2;
                        const newY = (y + el.height()) * scaleY - newHeight;
                        const newWidth = Math.min(
                            Math.max((el.width() * scaleX) + 1, 5),
                            proxyDoc.width() + proxyPadding / 2 - newX
                        );

                        const spanId = el.data("span-id");
                        $('<div/>', {
                            "class": 'proxy-underline annotation-hidden',
                            "data-span-id": spanId,
                            "css": {
                                "position": "absolute",
                                "left": Math.round(newX),
                                "top": Math.round(newY),
                                "background-color": color,
                                "width": newWidth,
                                "height": newHeight,

                            }
                        }).appendTo(proxyDoc);
                    }
                );
            }

            // Loop through all active highlights in doc view and create associated proxy element
            if (showSemantic) {
                $(".display .main-doc .highlight").each(
                    function (index, value) {
                        const el = $(value);
                        const x = el.position().left;
                        const y = mainDoc.scrollTop() + el.position().top - mainDoc.position().top;
                        const newHeight = 4;
                        const color = el.css("background-color");
                        const proxyPadding = proxyDoc.innerWidth() - proxyDoc.width()
                        const newX = x * scaleX + proxyPadding / 2;
                        const newY = (y + el.height()) * scaleY - newHeight;
                        const newWidth = Math.min(
                            Math.max((el.width() * scaleX) + 1, 5),
                            proxyDoc.width() + proxyPadding / 2 - newX
                        );
                        const proxyEl = $('<div/>', {
                            "class": 'proxy-highlight annotation-hidden',
                            "css": {
                                "position": "absolute",
                                "left": Math.round(newX),
                                "top": Math.round(newY),
                                "background-color": color,
                                "width": newWidth,
                                "height": newHeight,
                            }
                        }).appendTo(proxyDoc);
                        // Copy data attributes
                        proxyEl.data(el.data());
                        // Set classes for matching
                        proxyEl.addClass(el.data("match-classes"))
                    }
                );
            }
            $('<div/>', {
                "class": 'proxy-scroll hidden',
                "css": {
                    "top": proxyScrollTop,
                    "height": proxyScrollHeight,
                }
            }).appendTo(proxyDoc);
            if (hasScroll()) {
                $(".display .proxy-scroll").removeClass("hidden")
            }

            $(".display .proxy-doc")
                .mousedown(function (event) {
                    saveDragPos = parseFloat(event.pageY);
                    isDragging = true;
                    event.preventDefault();
                })
                .mousemove(function (event) {
                    const dragPos = parseFloat(event.pageY);
                    if (isDragging) {
                        const distanceMoved = dragPos - saveDragPos;
                        scrollBy(distanceMoved);
                        saveDragPos = dragPos;
                        event.preventDefault();
                    }
                })
                .mouseup(function (event) {
                    isDragging = false;
                })
                .mouseenter(function () {
                    disableScrollEvent = true;
                    $(".display .proxy-scroll").addClass("hover")
                })
                .mouseleave(function () {
                    isDragging = false;
                    disableScrollEvent = false;
                    $(".display .proxy-scroll").removeClass("hover")
                })
                .on('wheel', function (event) {
                    scrollBy(event.originalEvent.deltaY / 4);
                    event.preventDefault();
                });

            // TODO: Handle user clicking in scroll region

            $(".display .main-doc").scroll(function () {
                if (disableScrollEvent) return;
                $(".display .proxy-scroll")
                    .css(
                        "top", $(this).scrollTop() * scaleY
                    )
            })
        }

        function resizeend() {
            if (new Date() - rtime < delta) {
                setTimeout(resizeend, delta);
            } else {
                timeout = false;
                updateAnnotations();
                toggleScrollbar();
            }
        }

        function toggleScrollbar() {
            if (hasScroll()) {
                $(".display .proxy-scroll").removeClass("hidden");
            } else {
                $(".display .proxy-scroll").addClass("hidden");
            }
        }

        function updateAnnotations() {

            showSemantic = $("#option-semantic").is(":checked");
            showLexical = $("#option-lexical").is(":checked");
            showEntities = $("#option-entities").is(":checked");

            if (showSemantic || showLexical) {
                $(".summary-item").addClass("selectable")
            } else {
                $(".summary-item").removeClass("selectable")
            }

            if (showLexical) {
                $(".underline").removeClass("annotation-hidden");
                $(".summary-item").addClass("show-lexical");
            } else {
                $(".underline").addClass("annotation-hidden");
                $(".summary-item").removeClass("show-lexical");
            }
            if (showSemantic) {
                $(".highlight").removeClass("annotation-hidden");
            } else {
                $(".highlight").addClass("annotation-hidden");
            }
            if (showEntities) {
                $(".summary-item").addClass("show-entities")
            } else {
                $(".summary-item").removeClass("show-entities")
            }

            createProxy();

            if (showLexical) {
                $(".proxy-underline").removeClass("annotation-hidden");
            } else {
                $(".proxy-underline").addClass("annotation-hidden");
            }
            if (showSemantic) {
                $(".proxy-highlight").removeClass("annotation-hidden");
            } else {
                $(".proxy-highlight").addClass("annotation-hidden");
            }

            $(".summary-item .highlight").tooltip("disable");
            if (showSemantic) {
                $(".summary-item.selected .highlight").tooltip("enable")
            }
        }

        function removeDocTooltips(excludeHighlightId) {
            let excludeSelector = "";
            if (excludeHighlightId != null) {
                excludeSelector = `[data-highlight-id!=${excludeHighlightId}])`
            } else {
                $(`.display .main-doc .highlight${excludeSelector}`).tooltip("dispose").removeData("tooltip-timestamp");
            }
        }

        function resetUnderlines() {
            $('.annotation-invisible').removeClass("annotation-invisible");
            $('.annotation-inactive').removeClass("annotation-inactive");
        }

        function showDocTooltip(el) {
            const topDocHighlightId = $(el).data("top-doc-highlight-id");
            const topDocSim = $(el).data("top-doc-sim");
            const topHighlight = $(`.display .main-doc .highlight[data-highlight-id=${topDocHighlightId}]`);
            if (!isViewable(topHighlight[0])) {
                return;
            }
            topHighlight.tooltip({title: `Most similar (${topDocSim})`, trigger: "manual"});
            topHighlight.tooltip("show");
            const tooltipTimestamp = Date.now();
            topHighlight.data("tooltip-timestamp", tooltipTimestamp);
            setTimeout(function () {
                if (topHighlight.data("tooltip-timestamp") == tooltipTimestamp) {
                    topHighlight.tooltip("dispose");
                }
            }, 3000);
        }


        function resetHighlights() {
            $('.summary-item.selected .annotation-inactive').removeClass("annotation-inactive");
            $('.summary-item.selected .annotation-invisible').removeClass("annotation-invisible");
            $('.temp-color')
                .each(function () {
                    $(this).css("background-color", $(this).data("primary-color"));
                })
                .removeClass("temp-color")
            $('.highlight.selected').removeClass("selected")
            $('.proxy-highlight.selected').removeClass("selected")
            $('.summary-item [title]').removeAttr("title");
        }

        function highlightToken() {
            mouseOverHighlight = true;
            const highlightId = $(this).data("highlight-id");
            $(`.summary-item.selected .highlight:not(.summary-highlight-${highlightId})`).addClass("annotation-inactive");
            $('.highlight.selected').removeClass("selected")
            $('.proxy-highlight.selected').removeClass("selected")
            const matchedDocHighlight = `.display .main-doc .summary-highlight-${highlightId}`;
            const matchedProxyHighlight = `.proxy-doc .summary-highlight-${highlightId}`;
            $(matchedDocHighlight + ", " + matchedProxyHighlight)
                .each(function () {
                    const newHighlightColor = $(this).data(`color-${highlightId}`);
                    $(this).css("background-color", newHighlightColor);
                    $(this).addClass("selected");
                })
                .addClass("temp-color");
            $(".underline").addClass("annotation-inactive");
            $(".proxy-underline").addClass("annotation-invisible")
            showDocTooltip(this);
            $(this).addClass("selected");
            $(this).removeClass("annotation-inactive");
            $('.summary-item [title]').removeAttr("title");
            if (!isViewable($(matchedDocHighlight)[0])) {
                    $(this).attr("title", "Click to scroll to most similar word.")
                }
        }

        function isViewable(el) {
            const rect = el.getBoundingClientRect();
            return (rect.top >= 0) && (rect.bottom <= window.innerHeight);
        }

        // Initialization

        $(function () {
            $('[data-toggle="tooltip"]').tooltip({
                // 'boundary': '.summary-container'
                trigger: 'hover'
            })
        })
        updateAnnotations();

        // Bind events

        $(".summary-item").mousemove(
            function () {
                mouseMovedAfterClick = true;
            }
        );

        $(window).resize(function () {
            rtime = new Date();
            if (timeout === false) {
                timeout = true;
                setTimeout(resizeend, delta);
            }
        });

        $(".summary-list").on(
            "click",
            ".summary-item.selectable:not(.selected)",
            function () {
                mouseMovedAfterClick = false;
                const summary_index = $(this).data("index");

                // Update summary items
                $(".summary-item.selected").removeClass("selected")
                $(this).addClass("selected")

                // Update doc
                // Show the version of document aligned with selected summary index
                $(`.doc[data-index=${summary_index}]`).removeClass("nodisplay").addClass("display");
                // Hide the version of document not aligned with selected summary index
                $(`.doc[data-index!=${summary_index}]`).removeClass("display").addClass("nodisplay");

                updateAnnotations();
            }
        );

        $("#option-lexical").click(function () {
            updateAnnotations();
        });
        $("#option-semantic").click(function () {
            updateAnnotations();
        });
        $("#option-entities").click(function () {
            updateAnnotations();
        });

        const activeUnderlines = ".summary-item.selected .underline:not(.annotation-inactive):not(.annotation-hidden)";
        $(".summary-list").on(
            "mouseenter",
            activeUnderlines,
            function () {
                if (!mouseMovedAfterClick) {
                    return
                }
                const spanId = $(this).data("span-id");
                // TODO Consolidate into single statement
                $(`.summary-item.selected .underline[data-span-id=${spanId}]`).removeClass("annotation-inactive");
                $(`.doc .underline[data-span-id=${spanId}]`).removeClass("annotation-inactive");
                $(`.proxy-underline[data-span-id=${spanId}]`).removeClass("annotation-invisible");

                $(`.summary-item.selected .underline[data-span-id!=${spanId}]`).addClass("annotation-inactive");
                $(`.doc .underline[data-span-id!=${spanId}]`).addClass("annotation-inactive");
                $(`.proxy-underline[data-span-id!=${spanId}]`).addClass("annotation-invisible");

                $(".summary-item.selected .highlight:not(.annotation-hidden)").addClass("annotation-inactive");
            }
        );
        $(".summary-list").on(
            "mouseleave",
            activeUnderlines,
            resetUnderlines
        );
        $(".summary-list").on(
            "click",
            activeUnderlines,
            function () {
                // Find aligned underline in doc  and scroll doc to that position
                const mainDoc = $(".display .main-doc");
                const spanId = $(this).data("span-id");
                const matchedUnderline = $(`.doc .underline[data-span-id=${spanId}]`);
                mainDoc.animate({
                        scrollTop: mainDoc.scrollTop() +
                            matchedUnderline.offset().top - mainDoc.offset().top - 60
                    },
                    300
                )
            }
        );

        const activeHighlights = ".summary-item.selected .highlight:not(.annotation-hidden):not(.matches-ngram), " +
            ".summary-item.selected:not(.show-lexical) .highlight:not(.annotation-hidden)";
        $(".summary-list").on(
            "mouseenter",
            activeHighlights,
            function () {
                if (!mouseMovedAfterClick) {
                    return
                }
                highlightToken.call(this);
            })
        $(".summary-list").on(
            "mouseleave",
            activeHighlights,
            function () {
                removeDocTooltips();
                mouseOverHighlight = false;
                setTimeout( // set delay on effect of mouseleave in case another mouseover happens within time. Avoids jumpiness in interaction.
                    function () {
                        if (mouseOverHighlight == false) {
                            resetHighlights();
                            resetUnderlines();
                        }
                    },
                    100
                );
            }
        );
        $(".summary-list").on(
            "click",
            activeHighlights,
            function () {
                // Find corresponding highlight in doc representing max similarity and scroll doc to that position
                const topDocHighlightId = $(this).data("top-doc-highlight-id");
                removeDocTooltips(topDocHighlightId);
                const topDocHighlight = $(`.display .main-doc .highlight[data-highlight-id=${topDocHighlightId}]`);
                const mainDoc = $(".display .main-doc");
                const el = this;
                mainDoc.animate({
                        scrollTop: mainDoc.scrollTop() +
                            topDocHighlight.offset().top - mainDoc.offset().top - 60
                    },
                    300,
                    function () {
                        setTimeout(
                            function () {
                                showDocTooltip(el);
                            },
                            300
                        )
                    }
                )
            }
        );
        $(".summary-list").on(
            "mouseleave",
            ".summary-item.selected .content",
            function () {
                resetHighlights();
                resetUnderlines();
            },
        );
    }
)
;

