/*
 * scratchblocks2
 * http://github.com/blob8108/scratchblocks2
 *
 * Copyright 2013, Tim Radvan
 * MIT Licensed
 * http://opensource.org/licenses/MIT
 */


var scratchblocks2 = function ($) {
    "use strict";

    var sb2 = {}, // The module we export

        // Bracket characters
        BRACKETS = "([<)]>",

        // Valid arguments to "of" dropdown, for resolving ambiguous situations
        MATH_FUNCTIONS = ["abs", "floor", "ceiling", "sqrt", "sin", "cos",
                "tan", "asin", "acos", "atan", "ln", "log", "e^", "10^"],

        // List of insert classes -- don't call find_block on these
        DATA_INSERTS = ["string", "dropdown", "number", "number-dropdown",
                "color"],

        // List of classes for get_arg_shape
        ARG_SHAPES = ["reporter", "embedded", "boolean", "string", "dropdown",
                "number", "number-dropdown",

                // special shapes:
                "list-dropdown", "math-function"],


        // List of valid classes used in HTML
        CLASSES = {
            "misc": [
                "scratchblocks2-container",
                "script",
                "empty",
                "list-dropdown"
            ],
            "comments": [
                "comment",
                "attached",
                "to-hat",
                "to-reporter"
            ],
            "internal": [
                "math-function"
            ],
            "shape": [
                "hat",
                "cap",
                "stack",
                "embedded",
                "reporter",
                "boolean",
                "string",
                "dropdown",
                "number",
                "number-dropdown",
                "color",
                "custom-definition",
                "custom-arg",
                "outline",

                "cstart",
                "cmouth",
                "cwrap",
                "celse",
                "cend",
                "ifblock",
                "capend"
            ],
            "category": [
                "obsolete",

                "control",
                "custom",
                "events",
                "list",
                "looks",
                "motion",
                "operators",
                "pen",
                "sensing",
                "sound",
                "variables",
                "purple"  // The ([slider v] sensor value) and 
                          // <sensor [button pressed v]?> blocks. I'm not sure
                          // what category this is supposed to be.
            ]
        },
        all_classes,

        // The list of blocks
        blocks_db,

        // Used to keep a copy of sb2.blocks, so we can detect changes
        blocks_original;


    function log(message) {
        if (window.console !== undefined) {
            window.console.log(message);
        }
    }


    function assert(bool) {
        if (!bool) {
            log("Assertion failed!");
            //debugger;
        }
    }


    /* is class name in class list? */
    function is_class(name) {
        if (all_classes === undefined) {
            all_classes = [];
            $.each(CLASSES, function (i, classes_group) {
                all_classes = all_classes.concat(classes_group);
            });
        }
        return ($.inArray(name, all_classes) > -1);
    }


    /* helper function for class name prefixes */
    function cls(name) {
        if (!is_class(name)) {
            log("Invalid class: " + name);
            //debugger;
        }
        return name;
    }

    /* Bracket helpers */
    function is_open_bracket(chr) {
        var bracket_index = BRACKETS.indexOf(chr);
        return (-1 < bracket_index && bracket_index < 3);
    }
    function is_close_bracket(chr) {
        return (2 < BRACKETS.indexOf(chr));
    }
    function get_matching_bracket(chr) {
        return BRACKETS[BRACKETS.indexOf(chr) + 3];
    }


    /* Stop lt/gt signs between open/close brackets being seen as open/close
     * brackets. Makes sure booleans are parsed properly.
     *
     * Returns true if it's lt/gt, as there is a close bracket behind and an
     * open bracket ahead:
     *      ) < [
     *
     * Returns false otherwise, if it's an open/close bracket itself:
     *      <(      ...etc
     */
    function is_lt_gt(code, index) {
        var chr, i;

        if ((code[index] !== "<" && code[index] !== ">") ||
                index === code.length ||
                index === 0) {
            return false;
        }

        // HACK: "when distance < (20)" block
        log([code.substr(0, index)])
        if (/^whendistance$/i.test(strip_block_text(code.substr(0, index)))) {
            return true; // don't parse as boolean
        }

        for (i = index + 1; i < code.length; i++) {
            chr = code[i];
            if (is_open_bracket(chr)) {
                break; // might be an innocuous lt/gt!
            } else if (chr !== " ") {
                return false; // something else => it's a bracket
            }
        }

        for (i = index - 1; i > -1; i--) {
            chr = code[i];
            if (is_close_bracket(chr)) {
                break; // must be an innocuous lt/gt!
            } else if (chr !== " ") {
                return false; // something else => it's a bracket
            }
        }

        // it's an lt/gt sign!
        return true;
    }


    /* Strip one level of surrounding <([ brackets from scratchblocks code */
    function strip_brackets(code) {
        if (is_open_bracket(code[0])) {
            var bracket = code[0];
            if (code[code.length - 1] === get_matching_bracket(bracket)) {
                code = code.substr(0, code.length - 1);
            }
            code = code.substr(1);
        }
        return code;
    }


    function split_into_pieces(code) {
        var pieces = [],
            piece = "",
            matching_bracket = "",
            nesting = [],
            chr,
            i;

        for (i = 0; i < code.length; i++) {
            chr = code[i];

            if (nesting.length > 0) {
                piece += chr;
                if (is_open_bracket(chr) && !is_lt_gt(code, i) &&
                        nesting[nesting.length - 1] !== "[") {
                    nesting.push(chr);
                    matching_bracket = get_matching_bracket(chr);
                } else if (chr === matching_bracket && !is_lt_gt(code, i)) {
                    nesting.pop();
                    if (nesting.length === 0) {
                        pieces.push(piece);
                        piece = "";
                    } else {
                        matching_bracket = get_matching_bracket(
                            nesting[nesting.length - 1]
                        );
                    }
                }
            } else {
                if (is_open_bracket(chr) && !is_lt_gt(code, i)) {
                    nesting.push(chr);
                    matching_bracket = get_matching_bracket(chr);

                    if (piece) {
                        pieces.push(piece);
                    }
                    piece = "";
                }
                piece += chr;
            }
        }

        // last piece
        if (piece) {
            pieces.push(piece);
        }

        return pieces;
    }


    /* Return the category class for the given block. */
    function get_block_category($block) {
        var block_category;
        $.each(CLASSES.category, function (i, category) {
            if ($block.hasClass(cls(category))) {
                block_category = category;
            }
        });
        return block_category;
    }


    /* Return the shape class for the given insert. */
    function get_arg_shape($arg) {
        if (!$arg) return "";
        var arg_shape;
        $.each(ARG_SHAPES, function (i, shape) {
            if ($arg.hasClass(cls(shape))) {
                arg_shape = shape;
            }
        });
        return arg_shape;
    }


    /* Strip block text, for looking up in blocks db. */
    function strip_block_text(text) {
        return text.replace(/[ ,%?:]/g, "").toLowerCase();
    }


    /* Get text from $block DOM element. Make sure you clone the block first. */
    function get_block_text($block) {
        $block.children().remove();
        return strip_block_text($block.text());
    }


    /* Hex color #rrggb or #rgb to [r, g, b] */
    function hex2rgb(hexStr) {
        var hex, r, g, b;
        assert(hexStr[0] === "#");
        hexStr = hexStr.substring(1);
        if (hexStr.length === 3) {
            r = hexStr[0];
            g = hexStr[1];
            b = hexStr[2];
            hexStr = r + r + g + g + b + b;
        }
        hex = parseInt(hexStr, 16);
        if (hexStr.length === 6) {
            r = (hex & 0xff0000) >> 16;
            g = (hex & 0x00ff00) >> 8;
            b = hex & 0x0000ff;
        }
        return [r, g, b];
    }


    function clamp(x, a, b) {
        return Math.min(b, Math.max(x, a));
    }


    /* Multiply colour by scalar value. */
    function scale_color(rgb, scale) {
        var r = rgb[0],
            g = rgb[1],
            b = rgb[2];
        r = parseInt(clamp(r * scale, 0, 255));
        g = parseInt(clamp(g * scale, 0, 255));
        b = parseInt(clamp(b * scale, 0, 255));
        return [r, g, b];
    }


    function rgb2css(rgb) {
        var r = rgb[0],
            g = rgb[1],
            b = rgb[2];
        return "rgb(" + r + ", " + g + ", " + b + ") ";
    }

    /* Set hexColor as background color of $block */
    function apply_block_color($block, hexColor) {
        var rgb = hex2rgb(hexColor);
        var btop = rgb2css(scale_color(rgb, 1.4));
        var bbot = rgb2css(scale_color(rgb, 0.7));
        $block.css({
            "background-color": rgb2css(rgb),
            "border-top-color": btop,
            "border-left-color": btop,
            "border-bottom-color": bbot,
            "border-right-color": bbot
        });
    }


    /* Parse the blocks database. */
    function load_blocks_db() {
        var db = {},
            category = "";

        // newlines are escaped, so split at double-space instead
        $.each(sb2.blocks.split(/ {2}|\n|\r/), function (i, line) {
            line = line.trim();
            if (line.length === 0) {
                return; // continue
            }

            var classes = [category],
                commentIndex = line.indexOf("##"),
                extra,
                $block,
                arg_shapes,
                text,
                block;

            // get category comment
            if (commentIndex === 0) {
                category = line.replace(/##/g, "").trim().toLowerCase();
                return; // continue
            }
            if (commentIndex > 0) {
                extra = line.substr(commentIndex + 2).trim();
                line = line.substr(0, commentIndex);
                line = line.trim();
                classes = classes.concat(extra.split(" "));
            }

            // parse block
            $block = render_block(line, "database:stack");

            // get arg shapes
            arg_shapes = [];
            $block.children().each(function (i, arg) {
                arg_shapes.push(get_arg_shape($(arg)));
            });

            // get text
            $block.children().remove();
            text = $block.text();
            text = strip_block_text(text);

            // add block
            block = [classes, arg_shapes];
            if (db[text] === undefined) {
                db[text] = [];
            }
            db[text].push(block);
        });

        blocks_db = db;

        // keep a reference to the blocks definition, in case it changes.
        blocks_original = sb2.blocks;
    }


    /* Return the blocks database, loading it first if needed. */
    function get_blocks_db() {
        if (blocks_original === undefined ||
                blocks_original !== sb2.blocks) {
            // blocks code has changed, parse it again!
            load_blocks_db();
            log("Parsed blocks db.");
        }
        return blocks_db;
    }


    /* Return [classes, arg_shapes] for a block, given its text. Uses args as
     * hints. */
    function find_block(text, $arg_list) {
        // strip block text
        text = strip_block_text(text);

        var blocks = get_blocks_db(),
            block,
            poss_blocks,
            classes = [],
            arg_classes = [];

        poss_blocks = blocks[text];

        // get block for text
        if (poss_blocks !== undefined) {
            block = poss_blocks[0];

            if (poss_blocks.length > 1) {
                // choose based on args
                $.each(poss_blocks, function (i, poss_block) {
                    var category = poss_block[0][0],
                        need_args = poss_block[1],
                        fits = true,
                        $arg,
                        arg_shape,
                        j;

                    for (j = 0; j < need_args.length; j++) {
                        $arg = $arg_list[j];
                        arg_shape = get_arg_shape($arg);

                        if (arg_shape !== need_args[j]) {
                            if (need_args[j] === "math-function") {
                                // check is valid math function
                                var func =  $arg.text().replace(/[ ]/g, "")
                                        .toLowerCase();
                                if ($.inArray(func, MATH_FUNCTIONS) === -1) {
                                    // can't find the argument!
                                    fits = false;
                                    break;
                                }

                            } else if (
                                // allow reporters in number/string inserts
                                !((arg_shape === "reporter" ||
                                   arg_shape === "embedded"
                                 ) && (
                                   need_args[j] === "number" ||
                                   need_args[j] === "string"
                                ))
                            ) {
                                fits = false;
                                break;
                            }
                        }
                    }

                    if (fits) {
                        block = poss_block;
                    }
                });
            }
        }

        // HACK: scratch 1.4 "when ... clicked" block
        if (block === undefined) {
            if (/^when.*clicked$/.test(text)) {
                block = blocks["whenthisspriteclicked"][0];
            }
        }

        if (block) {
            classes = block[0];

            // tag list dropdowns
            $.each(block[1], function (i, shape) {
                if (shape === "list-dropdown" || shape === "math-function") {
                    arg_classes.push(shape);
                } else {
                    arg_classes.push("");
                }
            });
        }

        return [classes, arg_classes];
    }


    /* Render script code to DOM. */
    function render_block(code, need_shape) {
        var $block = $("<div>"),
            shape,
            is_database = false,
            category = "",
            bracket = "",
            is_dropdown = false,
            pieces = [],
            text = "",
            classes = [];

        // init vars
        if (/^database:?/.test(need_shape)) {
            is_database = true;
            need_shape = need_shape.substr(9);
        }
        if (need_shape === undefined) {
            need_shape = "";
        }
        shape = need_shape;

        // trim
        code = code.trim();
        if (code === "") {
            return;
        }

        if (need_shape === "stack" && split_into_pieces(code).length > 1) {
            // not an insert!
        } else {
            // strip brackets
            if (is_open_bracket(code[0])) {
                bracket = code[0];
                code = strip_brackets(code);
            }

            // trim again
            if (bracket !== "[") {
                code = code.trim();
            }
        }

        // check for custom block definition
        if (/^define/i.test(code)) {
            shape = "custom-definition";
            code = code.substr(6).trim();
        }

        if (bracket === "[") {
            // make sure it's an insert
            pieces = [code];
        } else {
            // split into pieces
            pieces = split_into_pieces(code);
        }

        // check shape
        if (shape !== "custom-definition") {
            if (pieces.length > 1) {
                // block
                switch (bracket) {
                    case "(":
                        shape = "embedded";
                        break;

                    case "<":
                        shape = "boolean";
                        break;

                    default:
                        assert(shape === "stack");
                        break;
                }
            } else {
                // insert
                switch (bracket) {
                    case "(":
                        if (/^(-?[0-9.]+( v)?)?$/i.test(code)) {
                            // number
                            shape = "number";

                            // dropdown?
                            if (/ v$/i.test(code)) {
                                is_dropdown = true;
                                code = code.substr(0, code.length - 2);
                                shape = "number-dropdown";
                            }
                        } else if (/ v$/i.test(code)) {
                            // rounded dropdowns
                            is_dropdown = true;
                            code = code.substr(0, code.length - 2);
                            shape = "number-dropdown"; // not actually number
                        } else {
                            // reporter (or embedded!)
                            shape = "reporter";
                        }
                        break;

                    case "[":
                        if (/^#[A-Fa-f0-9]{3,6}$/.test(code)) {
                            // color
                            shape = "color";
                        } else {
                            // string
                            shape = "string";

                            // dropdown?
                            if (/ v$/i.test(code)) {
                                is_dropdown = true;
                                code = code.substr(0, code.length - 2);
                                shape = "dropdown";
                            }
                        }
                        break;

                    case "<":
                        // boolean
                        shape = "boolean";
                        category = "operators";
                        break;

                    default:
                        // should be stack
                        break;
                }
            }
        }

        // check for variables
        if (shape === "reporter") {
            if (pieces.length === 1 &&
                    !is_open_bracket(pieces[0][0])) {
                category = "variables"; // only used if we can't find_block
            } else { // check for embedded blocks
                shape = "embedded";
            }
        }

        // add shape class
        $block.addClass(cls(shape));

        // empty blocks
        if (code.length === 0) {
            code = " "; // must have content to size correctly
            pieces = [code];
            $block.addClass(cls("empty"));
        }

        // render color inputs
        if (shape === "color") {
            $block.css({
                "background-color": code
            });
            $block.text(" ");
            return $block;
        }

        // RENDARRR //

        function is_block(piece) {
            return piece.length > 1 && (
                is_open_bracket(piece[0]) || is_close_bracket(piece[0])
            );
        }

        // filter out block text
        $.each(pieces, function (i, piece) {
            if (!is_block(piece)) {
                text += piece;
            }
        });

        // render the pieces
        var $arg_list = [];
        if (shape === "custom-definition") {
            // custom definition args
            $block.append("define");
            var $outline = $("<div>").addClass(cls("outline"));
            $block.append($outline);

            $.each(pieces, function (i, piece) {
                if (is_block(piece)) {
                    var $arg = $("<div>").addClass(cls("custom-arg"));
                    if (piece[0] === "<") {
                        $arg.addClass(cls("boolean"));
                    }
                    $arg.text(strip_brackets(piece));
                    $outline.append($arg);
                } else {
                    $outline.append(piece);
                }
            });
        } else if (pieces.length === 1) {
            $block.text(code);
        } else {
            $.each(pieces, function (i, piece) {
                var $arg;
                if (is_block(piece)) {
                    if (is_database) {
                        // DATABASE: avoid find_block
                        $arg = render_block(piece, "database");
                    } else {
                        $arg = render_block(piece);
                    }
                    $block.append($arg);
                    $arg_list.push($arg);
                } else {
                    $block.append(piece);
                }

                // DATABASE
                if (is_database) {
                    // tag list dropdowns
                    if (piece === "[list v]") {
                        $arg.addClass(cls("list-dropdown"));
                    }
                    // tag math function
                    if (piece === "[sqrt v]") {
                        $arg.addClass(cls("math-function"));
                    }
                }
            });
        }

        // get category
        if (shape === "custom-definition") {
            $block.addClass(cls("custom"));
        } else if ($.inArray(shape, DATA_INSERTS) > -1) {
            // don't add category to inserts
        } else {
            var arg_classes = [],
                info;

            // find block
            if (!is_database) {
                info = find_block(text, $arg_list);
                classes = info[0];
                arg_classes = info[1];
            }

            if (classes.length === 0) {
                // can't find the block!
                if (category !== "") {
                    $block.addClass(cls(category));
                } else {
                    $block.addClass(cls("obsolete"));
                }
            } else {
                $.each(classes, function (i, name) {
                    if (!(/^-/.test(name))) {
                        $block.addClass(cls(name));
                    }
                });

                $.each(arg_classes, function (i, name) {
                    var $arg = $arg_list[i];
                    if ($arg && name) {
                        if (name === "list-dropdown" &&
                                !$arg.hasClass("dropdown")) {
                            // HACK - only recognise lists if they're dropdowns
                        } else {
                            $arg.addClass(name);
                        }
                    }
                });
            }
        }


        // replace images

        function replace_text_with_image(regex, image_class) {
            var html = $block.html(),
                image = '<span class="' + image_class + '"></span>';
            html = html.replace(regex, image);
            $block.html(html);
        }

        // image: green flag
        if ($.inArray("-green-flag", classes) > -1) {
            replace_text_with_image(/green flag|flag|gf/i, "green-flag");
        }

        // image: turn cw/ccw arrows
        if ($.inArray("-turn-arrow", classes) > -1) {
            if (/ccw|left/i.test(text)) {
                replace_text_with_image(/ccw|left/i, "arrow-ccw");
            } else {
                replace_text_with_image(/cw|right/i, "arrow-cw");
            }
        }


        // cend blocks: hide "end" text
        if ($block.hasClass(cls("cend"))) {
            var html = $block.html();
            $block.html("").append($("<span>").html(html));
        }


        // put free-floating inserts inside a stack block
        if (need_shape === "stack" && $.inArray(shape, DATA_INSERTS) > -1) {
            var $insert = $block;
            $block = $("<div>").addClass(cls("stack"))
                               .addClass(cls("obsolete"))
                               .append($insert);
        }


        return $block;
    }


    /* Render comment to DOM element. */
    function render_comment(text) {
        var $comment = $("<div>").addClass(cls("comment"))
                .append($("<div>").text(text.trim()));
        return $comment;
    }


    /* Render script code to a list of DOM elements, one for each script. */
    function render(code) {
        var scripts = [],
            $script,
            $current,
            nesting = 0,
            lines = code.split(/\n/),
            line,
            $block,
            $cwrap,
            $cmouth,
            $comment,
            $last_comment,
            comment_text,
            one_only,
            $first,
            i;

        function add_cend($block, do_comment) {
            $cmouth = $current;
            $cwrap = $cmouth.parent();
            assert($cwrap.hasClass(cls("cwrap")));

            $cwrap.append($block);
            $current = $cwrap.parent();
            nesting -= 1;

            // comment
            if ($comment && do_comment) {
                $cwrap.append($comment);
                $comment = null; // don't start multi-line comment
            }

            // give $block the color of $cwrap
            $block.removeClass(get_block_category($block));
            $block.addClass(get_block_category($cwrap));

            // check for cap blocks at end of cmouth
            if ($cmouth.find("> :last-child").hasClass("cap")) {
                $block.addClass(cls("capend"));
            }
        }

        function new_script() {
            // end any c blocks
            while (nesting > 0) {
                var $cend = $("<div><span>end</span></div>")
                        .addClass(cls("stack")).addClass(cls("cend"))
                        .addClass(cls("control"));
                add_cend($cend, false);
            }

            // push script
            if ($script !== undefined && $script.children().length > 0) {
                scripts.push($script);
            }

            // start new script
            $script = $("<div>").addClass(cls("script"));
            $current = $script;
            nesting = 0;
            $last_comment = null;
        }
        new_script();

        for (i = 0; i < lines.length; i++) {
            line = lines[i];

            // empty lines separate stacks
            if (line.trim() === "" && nesting === 0) {
                new_script();
                continue;
            }

            // parse comment
            $comment = null;
            comment_text = null;
            if (line.indexOf("//") > -1) {
                comment_text = line.substr(line.indexOf("//") + 2).trim();
                line = line.substr(0, line.indexOf("//"));
            }

            // render block
            $block = render_block(line, "stack");

            // render comment
            if ($block) {
                $last_comment = null;
            }

            if (comment_text) {
                if ($last_comment) {
                    $last_comment.children().text(
                        $last_comment.children().text() + "\n"
                        + comment_text
                    );
                } else {
                    $comment = render_comment(comment_text);
                }
            }

            // append block to script
            if ($block) {
                one_only = false;
                if ($block.hasClass(cls("hat")) ||
                        $block.hasClass(cls("custom-definition"))) {

                    new_script();

                    // comment
                    if ($comment) {
                        $comment.addClass(cls("to-hat"));

                        if ($block.hasClass(cls("custom-definition"))) {
                            $comment.addClass(cls("to-custom-definition"));
                        }
                    }
                } else if ($block.hasClass(cls("boolean")) ||
                           $block.hasClass(cls("embedded")) ||
                           $block.hasClass(cls("reporter"))) {
                    new_script();
                    one_only = true;

                    // comment
                    if ($comment) {
                        $comment.addClass(cls("to-reporter"));
                    }
                }

                // comment
                if ($comment) {
                    $comment.addClass(cls("attached"));
                }

                if ($block.hasClass(cls("cstart"))) {
                    $cwrap = $("<div>").addClass(cls("cwrap"));
                    $current.append($cwrap);
                    $cwrap.append($block);

                    // comment
                    if ($comment) {
                        $cwrap.append($comment);
                        $comment = null; // don't start multi-line comment
                    }

                    $cmouth = $("<div>").addClass(cls("cmouth"));
                    $cwrap.append($cmouth);
                    $current = $cmouth;

                    // give $cwrap the color of $block
                    $cwrap.addClass(get_block_category($block));

                    if ($block.hasClass(cls("cap"))) {
                        $cwrap.addClass(cls("cap"));
                        $block.removeClass(cls("cap"));
                    }

                    nesting += 1;

                } else if ($block.hasClass(cls("celse"))) {
                    if (nesting > 0) {
                        $cwrap = $current.parent();
                        assert($cwrap.hasClass(cls("cwrap")));

                        $cwrap.append($block);

                        // comment
                        if ($comment) {
                            $cwrap.append($comment);
                            $comment = null; // don't start multi-line comment
                        }

                        $cmouth = $("<div>").addClass(cls("cmouth"));
                        $cwrap.append($cmouth);
                        $current = $cmouth;

                        // give $block the color of $cwrap
                        $block.removeClass(get_block_category($block));
                        $block.addClass(get_block_category($cwrap));
                    } else {
                        $current.append($block);
                    }

                } else if ($block.hasClass(cls("cend"))) {
                    if (nesting > 0) {
                        add_cend($block, true);

                        if (nesting === 0 && $cwrap.hasClass("cap")) {
                            // finished a C cap block
                            new_script();
                        }
                    } else {
                        $current.append($block);
                    }
                } else {
                    $current.append($block);
                }

                if ($comment) {
                    $current.append($comment);
                }

                if (one_only || (nesting === 0 && $block.hasClass("cap"))) {
                    new_script();
                }

            } else {
                if ($comment) {
                    if (nesting > 0) {
                        $current.append($comment);
                    } else {
                        new_script();
                        $current.append($comment);
                        new_script();
                    }
                }
            }

            // for multi-line comments
            if ($comment) {
                $last_comment = $comment;
            }
        }

        // push last script
        new_script();


        var list_names = [],
            custom_blocks_text = [];

        // HACK list reporters
        for (i = 0; i < scripts.length; i++) {
            $script = scripts[i];
            $script.find(".list-dropdown").each(function (i, list) {
                var list_name = $(list).text();
                list_names.push(list_name);
            });
        }
        for (i = 0; i < scripts.length; i++) {
            $script = scripts[i];

            // HACK custom arg reporters
            var custom_arg_names = [];
            $first = $script.children().first();
            if ($first.hasClass("custom-definition")) {
                $first.find(".custom-arg").each(function (i, arg) {
                    custom_arg_names.push($(arg).text());
                });

                // store custom definitions
                custom_blocks_text.push(
                    get_block_text($first.find(".outline").clone())
                );
            }

            // replace variable reporters
            $script.find(".variables.reporter").each(function (i, variable) {
                var $variable = $(variable);
                var var_name = $variable.text();
                if ($.inArray(var_name, custom_arg_names) > -1) {
                    $variable.removeClass(cls("variables"))
                             .addClass(cls("custom-arg"));
                } else if ($.inArray(var_name, list_names) > -1) {
                    $variable.removeClass(cls("variables"))
                             .addClass(cls("list"));
                }
            });
        }

        // HACK custom stack blocks
        for (i = 0; i < scripts.length; i++) {
            $script = scripts[i];
            $script.find(".obsolete.stack").each(function (i, block) {
                $block = $(block);
                var text = get_block_text($block.clone());
                if ($.inArray(text, custom_blocks_text) > -1) {
                    $block.removeClass(cls("obsolete"))
                          .addClass(cls("custom"));
                }
            });
        }

        return scripts;
    }


    /* Render all matching elements in page to shiny scratch blocks.
     * Accepts a CSS-style selector as an argument.
     *
     *  scratchblocks2.parse("pre.blocks");
     *
     */
    sb2.parse = function (selector) {
        var selector = selector || "pre.blocks";

        // find elements
        $(selector).each(function (i, el) {
            var $el = $(el),
                code = $el.text(),
                scripts = render(code);

            $el.text("");
            $el.addClass(cls("scratchblocks2-container"));
            $.each(scripts, function (i, $script) {
                $el.append($script);
            });
        });
    }

    return sb2; // export the module
}(jQuery);



/* The list of blocks, in scratchblocks format.
 *
 * Special values:
    [list v] -- used to identify list dropdowns
    [sqrt v] -- identifies math function, in the ([sqrt v] of ()) block
 *
 */
scratchblocks2.blocks = "\
## Motion ##   \
move (10) steps   \
turn cw (15) degrees ## -turn-arrow   \
turn right (15) degrees ## -turn-arrow   \
turn ccw (15) degrees ## -turn-arrow   \
turn left (15) degrees ## -turn-arrow   \
\
point in direction (90 v)   \
point towards [ v]   \
\
go to x: (0) y: (0)   \
go to [mouse-pointer v]   \
glide (1) secs to x: (0) y: (0)   \
\
change x by (10)   \
set x to (0)   \
change y by (10)   \
set y to (0)   \
\
if on edge, bounce   \
\
set rotation style [left-right v]   \
\
(x position)   \
(y position)   \
(direction)   \
\
\
\
## Looks ##   \
say [Hello!] for (2) secs   \
say [Hello!]   \
think [Hmm...] for (2) secs   \
think [Hmm...]   \
\
show   \
hide   \
\
switch costume to [costume1 v]   \
next costume   \
switch backdrop to [backdrop1 v]   \
\
change [color v] effect by (25)   \
set [color v] effect to (0)   \
clear graphic effects   \
\
change size by (10)   \
set size to (100)%   \
\
go to front   \
go back (1) layers   \
\
(costume #)   \
(backdrop name)   \
(size)   \
\
## Stage-specific   \
## Looks ##   \
switch backdrop to [backdrop1 v] and wait   \
next backdrop   \
\
(backdrop #)   \
\
\
\
## Sound ##   \
play sound [pop v]   \
play sound [pop v] until done   \
stop all sounds   \
\
play drum (1 v) for (0.2) beats   \
rest for (0.2) beats   \
\
play note (60 v) for (0.5) beats   \
set instrument to (1 v)   \
\
change volume by (-10)   \
set volume to (100)%   \
(volume)   \
\
change tempo by (20)   \
set tempo to (60) bpm   \
(tempo)   \
\
\
\
## Pen ##   \
clear   \
\
stamp   \
\
pen down   \
pen up   \
\
set pen color to [#f0f]   \
change pen color by (10)   \
set pen color to (0)   \
\
change pen shade by (10)   \
set pen shade to (50)   \
\
change pen size by (1)   \
set pen size to (1)   \
\
\
\
## Variables ##   \
set [var v] to [0]   \
change [var v] by (1)   \
show variable [var v]   \
hide variable [var v]   \
\
\
\
## List ##   \
add [thing] to [list v]   \
\
delete (1 v) of [list v]   \
insert [thing] at (1 v) of [list v]   \
replace item (1 v) of [list v] with [thing]   \
\
(item (1 v) of [list v])   \
(length of [list v])   \
<[list v] contains [thing]>   \
\
show list [list v]   \
hide list [list v]   \
\
\
\
## Events ##   \
when gf clicked ## hat -green-flag   \
when green flag clicked ## hat -green-flag   \
when flag clicked ## hat -green-flag   \
when [space v] key pressed ## hat   \
when this sprite clicked ## hat   \
when backdrop switches to [backdrop1 v] ## hat   \
\
when [loudness v] > (10) ## hat   \
\
when I receive [message1 v] ## hat   \
broadcast [message1 v]   \
broadcast [message1 v] and wait   \
\
\
\
## Control ##   \
wait (1) secs   \
\
repeat (10) ## cstart   \
forever ## cstart cap   \
if <> then ## ifblock cstart   \
else ## celse   \
end ## cend   \
wait until <>   \
repeat until <> ## cstart  \
\
stop [all v] ## cap   \
\
when I start as a clone ## hat   \
create clone of [myself v]   \
delete this clone ## cap   \
\
\
\
## Sensing ##   \
<touching [ v]?>   \
<touching color [#f0f]?>   \
<color [#f0f] is touching?>   \
(distance to [ v])   \
\
ask [What's your name?] and wait   \
(answer)   \
\
<key [space v] pressed?>   \
<mouse down?>   \
(mouse x)   \
(mouse y)   \
\
(loudness)   \
\
(video [motion v] on [this sprite v])   \
turn video [on v]   \
set video transparency to (50)%   \
\
(timer)   \
reset timer   \
\
([x position v] of [Sprite1 v])   \
\
(current [minute v])   \
(days since 2000)   \
(username)   \
(user id)   \
\
\
\
## Operators ##   \
(() + ())   \
(() - ())   \
(() * ())   \
(() / ())   \
\
(pick random (1) to (10))   \
\
<[] < []>   \
<[] = []>   \
<[] > []>   \
\
<<> and <>>   \
<<> or <>>   \
<not <>>   \
\
(join [hello ] [world])   \
(letter (1) of [world])   \
(length of [world])   \
\
(() mod ())   \
(round ())   \
\
([sqrt v] of (9))   \
\
\
\
## Purple ##   \
when [button pressed v] ## hat   \
<sensor [button pressed v]?>   \
([slider v] sensor value)   \
\
turn motor on for (1) secs   \
turn motor on   \
turn motor off   \
set motor power (100)   \
set motor direction [this way v]   \
\
when distance < (20) ## hat   \
when tilt = (1) ## hat   \
(distance)   \
(tilt)   \
\
" +




// Obsolete Scratch 1.4 blocks //
"\
## Looks ##   \
switch to costume [costume1 v]   \
\
switch to background [background1 v]   \
next background   \
(background #)   \
\
\
\
## Control ##   \
if <> ## cstart   \
forever if <> ## cstart cap  \
stop script ## cap   \
stop all ## cap   \
\
\
\
## Events ##   \
when clicked ## hat   \
\
\
\
## Sensing ##   \
<loud?>   \
\
\
\
## Purple ##   \
motor on   \
motor off   \
motor on for (1) seconds   \
motor power (100)   \
motor direction [this way v]   \
";

