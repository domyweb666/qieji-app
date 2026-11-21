import Foundation

/// 任意 JSON 值。存檔和 iCloud 上的檔可能來自舊版、別台、網頁版，認不得的欄位要原樣留著（鐵則：欄位只能加）。
enum JSONValue: Equatable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    // MARK: 讀

    /// 讀不出來（不是 JSON）回 nil
    static func parse(_ text: String) -> JSONValue? {
        guard let data = text.data(using: .utf8) else { return nil }
        return parse(data)
    }

    static func parse(_ data: Data) -> JSONValue? {
        guard let any = try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]) else { return nil }
        return from(any)
    }

    static func from(_ any: Any) -> JSONValue {
        if any is NSNull {
            return .null
        }
        if let num = any as? NSNumber {
            // JSONSerialization 把 true／false 也給成 NSNumber：看底層型別才分得出來
            if CFGetTypeID(num) == CFBooleanGetTypeID() {
                return .bool(num.boolValue)
            }
            return .number(num.doubleValue)
        }
        if let str = any as? String {
            return .string(str)
        }
        if let arr = any as? [Any] {
            return .array(arr.map(from))
        }
        if let dict = any as? [String: Any] {
            return .object(dict.mapValues(from))
        }
        return .null
    }

    // MARK: 取值

    var stringValue: String? {
        if case let .string(val) = self {
            val
        } else {
            nil
        }
    }

    var numberValue: Double? {
        if case let .number(val) = self {
            val
        } else {
            nil
        }
    }

    var arrayValue: [JSONValue]? {
        if case let .array(val) = self {
            val
        } else {
            nil
        }
    }

    var objectValue: [String: JSONValue]? {
        if case let .object(val) = self {
            val
        } else {
            nil
        }
    }

    /// JavaScript 的 !!v：false、0、空字串、null 是假，其他都是真
    var truthy: Bool {
        switch self {
        case .null: false
        case let .bool(val): val
        case let .number(val): val != 0 && !val.isNaN
        case let .string(val): !val.isEmpty
        case .array, .object: true
        }
    }

    // MARK: 寫（跟 JavaScript 的 JSON.stringify 一字不差：指紋靠這個算）

    /// sortKeys：照鍵名排（UTF-16 順序，跟 JavaScript 的 sort 一樣）；skip：不寫的鍵（每一層都跳過）
    func stringify(sortKeys: Bool = true, skip: Set<String> = []) -> String {
        var out = ""
        write(into: &out, skip: skip)
        return out
    }

    private func write(into out: inout String, skip: Set<String>) {
        switch self {
        case .null: out += "null"
        case let .bool(val): out += val ? "true" : "false"
        case let .number(val): out += JSONValue.jsNumber(val)
        case let .string(val): out += JSONValue.jsString(val)
        case let .array(arr):
            out += "["
            for (idx, val) in arr.enumerated() {
                if idx > 0 {
                    out += ","
                }
                val.write(into: &out, skip: skip)
            }
            out += "]"
        case let .object(dict):
            out += "{"
            var first = true
            for key in dict.keys.filter({ !skip.contains($0) }).sorted(by: JSONValue.utf16Less) {
                guard let val = dict[key] else { continue }
                if !first {
                    out += ","
                }
                first = false
                out += JSONValue.jsString(key)
                out += ":"
                val.write(into: &out, skip: skip)
            }
            out += "}"
        }
    }

    static func utf16Less(_ lhs: String, _ rhs: String) -> Bool {
        lhs.utf16.lexicographicallyPrecedes(rhs.utf16)
    }

    /// JavaScript 印數字的樣子：整數不帶小數點，其他用最短表示法
    static func jsNumber(_ val: Double) -> String {
        if !val.isFinite {
            return "null"
        }
        if val == val.rounded(), abs(val) < 1e21 {
            if val == 0 {
                return "0"
            }
            if abs(val) < 9e15 {
                return String(Int64(val))
            }
            return String(format: "%.0f", val)
        }
        var text = "\(val)"
        guard let ePos = text.firstIndex(where: { $0 == "e" || $0 == "E" }) else { return text }
        // Swift 印 1e-07、5.0e-324；JavaScript 印 1e-7、5e-324
        var mantissa = String(text[..<ePos])
        var exponent = String(text[text.index(after: ePos)...])
        if mantissa.hasSuffix(".0") {
            mantissa.removeLast(2)
        }
        var sign = "+"
        if exponent.hasPrefix("-") {
            sign = "-"; exponent.removeFirst()
        } else if exponent.hasPrefix("+") {
            exponent.removeFirst()
        }
        while exponent.count > 1, exponent.hasPrefix("0") {
            exponent.removeFirst()
        }
        text = mantissa + "e" + sign + exponent
        return text
    }

    /// JavaScript 的 JSON.stringify(字串)：只跳脫引號、反斜線、控制字元
    static func jsString(_ val: String) -> String {
        var out = "\""
        for unit in val.unicodeScalars {
            switch unit.value {
            case 0x22: out += "\\\""
            case 0x5C: out += "\\\\"
            case 0x08: out += "\\b"
            case 0x0C: out += "\\f"
            case 0x0A: out += "\\n"
            case 0x0D: out += "\\r"
            case 0x09: out += "\\t"
            case 0 ..< 0x20: out += String(format: "\\u%04x", unit.value)
            default: out.unicodeScalars.append(unit)
            }
        }
        out += "\""
        return out
    }
}
