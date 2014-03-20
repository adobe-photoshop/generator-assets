{
    /*
     * Merge a size object into a results object, taking care to only copy defined values.
     */
    function mergeSize(size, result) {
        if (size) {
            if (size.hasOwnProperty("scale")) {
                result.scale = size.scale;
            }

            if (size.hasOwnProperty("width")) {
                result.width = size.width;
            }

            if (size.hasOwnProperty("widthUnit")) {
                result.widthUnit = size.widthUnit;
            }

            if (size.hasOwnProperty("height")) {
                result.height = size.height;
            }

            if (size.hasOwnProperty("heightUnit")) {
                result.heightUnit = size.heightUnit;
            }
        }
    }
}

start "Either a default asset specification or a layer asset specification"
    = defaults
    / speclist

defaults "A document defaults specification"
    = "default" defaults:defaultspeclist {
        return defaults;
    }

defaultspeclist "List of default specification components"
    = first:defaultspec [+,] rest:defaultspeclist {
        rest.unshift(first);
        return rest;
    }
    / only:defaultspec {
        return [only];
    }

defaultspec "A single default specification component"
    = whitespace+ size:scale? _ folders:folder* suffix:goodcharsanddots? _ 
    & { return size || folders.length > 0 || (suffix && suffix.trim().length > 0)} { // require at least one spec
        var result = {
            "default": true,
            name: text().trim()
        };

        if (folders.length > 0) {
            result.folder = folders.join("/");
        }

        if (suffix) {
            suffix = suffix.trim();
            if (suffix.length > 0) {
                result.suffix = suffix;
            }            
        }

        mergeSize(size, result);

        return result;
    }

speclist "List of layer specifications"
    = first:spec [+,] rest:speclist {
        rest.unshift(first); 
        return rest; 
    }
    / only:spec {
        return [only];
    }

spec "Layer specification"
    = filespec
    / _ layername:chars _ { // Unparsed layer name part
        return {
            name: layername.trim()
        };
    }

folder "A single folder name that ends with a slash and does not begin with a dot"
    = chars:goodcharsanddots "/" 
    ! { return chars[0] == "."; } {
        return chars;
    }

filespec "A size-and-file specification"
    = _ size:scale? _ folders:folder* filepart:filename _ { // Parsed layer name part
        var result = {
            name: text().trim(),
            file: filepart.filename,
            extension: filepart.extension,
        }

        if (folders.length > 0) {
            result.folder = folders.join("/");
        }

        if (filepart.hasOwnProperty("quality")) {
            result.quality = filepart.quality;
        }

        mergeSize(size, result);
        
        return result;
    }


filename "Filename and quality suffix"
    = nameparts:goodcharsthendot+ suffix:fileext {
        var filename = String.prototype.concat.apply("", nameparts) + suffix.extension,
            result = {
                filename: filename.trim(),
                extension: suffix.extension.toLowerCase()
            };

        if (suffix.hasOwnProperty("quality")) {
            result.quality = suffix.quality;
        }

        return result;
    } 

fileext "File extension and quality suffix"
    = extension:[a-zA-Z]+ "-"? quality:digit* pct:"%"? {
        var result = {
            extension: extension.join(""),
        };

        if (quality.length > 0 || pct) {
            result.quality = quality.join("") + (pct ? pct : "");
        }

        return result;
    }

scale "Relative or absolute scale"
    = relscale
    / abs:absscale " " {
        return abs;
    }

relscale "Relative scale, like 0.3"
    = scale:percent {
        return {
            scale: scale
        };
    }

absscale "Absolute scale, like 50x100cm"
    = width:abscomp _ "x"i _ height:abscomp {
        var result = {};

        if (width.hasOwnProperty("value")) {
            result.width = width.value;
        }

        if (width.hasOwnProperty("unit")) {
            result.widthUnit = width.unit;
        }

        if (height.hasOwnProperty("value")) {
            result.height = height.value;
        }

        if (height.hasOwnProperty("unit")) {
            result.heightUnit = height.unit;
        }

        return result;
    }

abscomp "Absolute scale component, like 100cm"
    = value:number unit:unit? {
        var result = {
            value: value,
        };

        if (unit) {
            result.unit = unit;
        }

        return result;
    }
    / "?" { // wildcard component
        return {
            // no unit
        };
    }

unit "Unit abbreviation"
    = first:[a-z]i second:[a-z]i {
        return first + second;
    }

percent "A percentage, like 30%"
    = num:number "%" {
        return num / 100;
    }

goodcharsanddots 
    = chars:goodcharanddot+ {
        return chars.join("")
    }

goodcharanddot "A good character or a dot"
    = goodchar
    / "."

goodcharsthendot "A sequence of characters that ends with a dot"
    = chars:goodchars "." {
        return chars.concat(".");
    }

chars "A sequence of characters, including dots"
    = chars:char+ {
        return chars.join("");
    }

goodchars "A sequence of characters, excluding dots"
    = chars:goodchar+ {
        return chars.join("");
    }

char "A character, including dots"
    = [^,+]

goodchar "A character, excluding dots and other weird things"
    = [^+,."/*<>?!:|\\\0-\x1F\x7f]

number "A nonnegative number, which may or may not have leading zeros"
    = parts:$(digits ("." digits)?) { return parseFloat(parts); } // e.g., 123 or 1.23
    / parts:$("." digits)           { return parseFloat("0" + parts); } // e.g., .123

digits
    = digit+

digit
    = [0-9]

_ "whitespace"
    = whitespace*

whitespace
    = [ \t\n\r]
