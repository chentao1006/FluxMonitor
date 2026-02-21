import Foundation
do {
    let url = URL(fileURLWithPath: NSHomeDirectory())
    let values = try url.resourceValues(forKeys: [.volumeTotalCapacityKey, .volumeAvailableCapacityForImportantUsageKey, .volumeAvailableCapacityKey])
    let total = values.allValues[.volumeTotalCapacityKey] as? Int64 ?? 0
    let availImportant = values.allValues[.volumeAvailableCapacityForImportantUsageKey] as? Int64 ?? 0
    let availReal = values.allValues[.volumeAvailableCapacityKey] as? Int64 ?? 0
    print("\(total) \(availImportant) \(availReal)")
} catch {
    print("0 0 0")
}
