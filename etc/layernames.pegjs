start
	= speclist

speclist
	= first:spec "+" rest:speclist {
		rest.unshift(first); 
		return rest; 
	}
	/ first:spec "," rest:speclist {
		rest.unshift(first);
		return rest;
	}
	/ only:spec { return [only]; }

spec
	= _ size:(scale?) _ filepart:filename _ {
		return {
			file: filepart.filename,
			extension: filepart.extension,
			quality: filepart.quality,
			scale: size && size.scale,
			width: size && size.width,
			widthUnit: size && size.widthUnit,
			height: size && size.height,
			heightUnit: size && size.heightUnit
		};
	}
	/ layername:rchars {
		return {
			file: layername
		};
	}

filename
	= nameparts:(rcharsthendot+) extpart:fileext {
		var filename = String.prototype.concat.apply("", nameparts) + extpart.extension;

		return {
			filename: filename,
			extension: extpart.extension.toLowerCase(),
			quality: extpart.quality
		};
	} 

fileext
	= ext:"jpg"i "-"? quality:jpgquality? {
		return {
			extension: ext,
			quality: quality
		}
	}
	/ ext:"png"i "-"? quality:pngquality? {
		return {
			extension: ext,
			quality: quality
		}
	}
	/ ext:"gif"i "-"? {
		return {
			extension: ext,
		}
	}
	/ ext:"webp" "-"? quality:webpquality? {
		return {
			extension: ext,
			quality: quality
		}
	}

jpgquality
	= digits:digits "%" { return digits.join("").concat("%"); }
	/ "10"	
	/ digit19

pngquality
	= "8"
	/ "24"
	/ "32"

webpquality
	= digits:digits "%" { return digits.join("").concat("%"); }
	/ "10"	
	/ digit19

scale
	= relscale
	/ absscale

absscale
	= width:absunit _ "x"i _ height:absunit {
		return {
			width: width.value,
			widthUnit: width.unit,
			height: height.value,
			heightUnit: height.unit
			};
		}

relscale
	= scale:percentage {
		return {
			scale: scale
		};
	}

absunit
	= value:number unit:(unit?) {
		return {
			value: value,
			unit: unit
			};
		}
	/ "?" {
		return { };
	}

unit
	= chars:([a-z][a-z]) { return chars.join(""); }

percentage
	= num:posint "%" { return num / 100; }

// stolen from the JSON grammer spec

rcharsthendot
  = chars:rchars "." {
  	return chars.concat(".");
  }

rchars
  = chars:rchar+ { return chars.join(""); }

chars
  = chars:char+ { return chars.join(""); }

rchar
  = [^\.\+,"\\\0-\x1F\x7f]
  / '\\"'  { return '"';  }
  / "\\\\" { return "\\"; }
  / "\\/"  { return "/";  }
  / "\\b"  { return "\b"; }
  / "\\f"  { return "\f"; }
  / "\\n"  { return "\n"; }
  / "\\r"  { return "\r"; }
  / "\\t"  { return "\t"; }
  / "\\u" digits:$(hexDigit hexDigit hexDigit hexDigit) {
      return String.fromCharCode(parseInt(digits, 16));
    }

char
  // In the original JSON grammar: "any-Unicode-character-except-"-or-\-or-control-character"
  = [^"\\\0-\x1F\x7f]
  / '\\"'  { return '"';  }
  / "\\\\" { return "\\"; }
  / "\\/"  { return "/";  }
  / "\\b"  { return "\b"; }
  / "\\f"  { return "\f"; }
  / "\\n"  { return "\n"; }
  / "\\r"  { return "\r"; }
  / "\\t"  { return "\t"; }
  / "\\u" digits:$(hexDigit hexDigit hexDigit hexDigit) {
      return String.fromCharCode(parseInt(digits, 16));
    }

number "number"
  = parts:$(int frac exp) _ { return parseFloat(parts); }
  / parts:$(int frac) _     { return parseFloat(parts); }
  / parts:$(int exp) _      { return parseFloat(parts); }
  / parts:$(int) _          { return parseFloat(parts); }

posint
  = parts:$(digit19 digits) { return parseInt(parts); }
  / parts:$(digit)			{ return parseInt(parts); }

int
  = posint
  / "-" posint

frac
  = "." digits

exp
  = e digits

digits
  = digit+

e
  = [eE] [+-]?

/*
 * The following rules are not present in the original JSON gramar, but they are
 * assumed to exist implicitly.
 *
 * FIXME: Define them according to ECMA-262, 5th ed.
 */

digit
  = [0-9]

digit19
  = [1-9]

hexDigit
  = [0-9a-fA-F]

/* ===== Whitespace ===== */

_ "whitespace"
  = whitespace*

// Whitespace is undefined in the original JSON grammar, so I assume a simple
// conventional definition consistent with ECMA-262, 5th ed.
whitespace
  = [ \t\n\r]