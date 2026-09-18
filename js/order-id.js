/**
 * Short ticket label for kitchen / POS / customer screens.
 * Full:  TW-260919-Q-001  →  Q-001
 * Legacy MB… / empty → passthrough as-is.
 */
function getShortOrderId(fullId) {
    const id = String(fullId || '').trim();
    if (!id) return '';
    const parts = id.split('-');
    if (parts.length >= 4) {
        return parts.slice(-2).join('-');
    }
    return id;
}

/** Prefer display_id for UI; fall back to order_no for old rows. */
function orderTicketLabel(orderOrId) {
    if (orderOrId == null) return '';
    if (typeof orderOrId === 'string') return getShortOrderId(orderOrId);
    const full = orderOrId.display_id || orderOrId.displayId || orderOrId.order_no || orderOrId.orderNo || '';
    return getShortOrderId(full);
}

if (typeof window !== 'undefined') {
    window.getShortOrderId = getShortOrderId;
    window.orderTicketLabel = orderTicketLabel;
}
