start
    = speclist

speclist "List of layer specifications"
    = first:spec [+,] rest:speclist {
        rest.unshift(first); 
        return rest; 
    }
    / only:spec {
        return [only];
    }

spec "Layer specification"
    = _ size:scale? _ filepart:filename _ { // Parsed layer name part
        var result = {
            file: filepart.filename,
            extension: filepart.extension,
        }

        if (filepart.quality) {
            result.quality = filepart.quality;
        }

        if (size) {
            if (size.scale !== null) {
                result.scale = size.scale;
            }

            if (size.width) {
                result.width = size.width;
            }

            if (size.widthUnit) {
                result.widthUnit = size.widthUnit;
            }

            if (size.height) {
                result.height = size.height;
            }

            if (size.heightUnit) {
                result.heightUnit = size.heightUnit;
            }
        }
        
        return result;
    }
    / _ layername:chars _ { // Unparsed layer name part
        return {
            name: layername.trim()
        };
    }

filename "Filename and quality suffix"
    = nameparts:goodcharsthendot+ suffix:fileext {
        var filename = String.prototype.concat.apply("", nameparts);

        filename += suffix.extension;

        return {
            filename: filename.trim(),
            extension: suffix.extension.toLowerCase(),
            quality: suffix.quality
        };
    } 

fileext "File extension and quality suffix"
    = extension:[a-zA-Z]+ "-"? quality:digit* pct:"%"? {
        var result = {
            extension: extension.join(""),
        };

        if (quality || pct) {
            result.quality = quality.join("") + (pct ? pct : "");
        }

        return result;
    }

scale "Relative or absolute scale"
    = relscale
    / abs:absscale " " { return abs; }

relscale
    = scale:percent {
        return {
            scale: scale
        };
    }

absscale "Absolute scale"
    = width:abscomp _ "x"i _ height:abscomp {
        return {
            width: width.value,
            widthUnit: width.unit,
            height: height.value,
            heightUnit: height.unit
        };
    }

abscomp "Absolute scale component"
    = value:number unit:unit? {
        return {
            value: value,
            unit: unit
        };
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

percent
    = num:digit* "%" {
        return parseInt(num.join("")) / 100;
    }

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
    = goodchar
    / "."

goodchar "A character, excluding dots and other weird things"
    = [^\.\+,"\\\0-\x1F\x7f]

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
