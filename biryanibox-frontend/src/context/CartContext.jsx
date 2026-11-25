import React, { useState, useEffect, useCallback, useRef } from "react";
import { CartContext } from "./contexts";
import { cartAPI } from "../services/api";

const safeGet = (key, fallback = null) => {
  try { const v = localStorage.getItem(key); return v !== null ? v : fallback; }
  catch { return fallback; }
};
const safeSet = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
const safeParseJSON = (str, fallback) => {
  try { return JSON.parse(str || "null") ?? fallback; }
  catch { return fallback; }
};

const isCustomerLoggedIn = () => {
  try {
    const token = safeGet("bb_token");
    const u = safeParseJSON(safeGet("bb_user"), null);
    return !!(token && u?.role === "customer");
  } catch { return false; }
};

const TABLE_CARTS_KEY = "biryani_box_table_carts";

const getLocalCart = () => safeParseJSON(safeGet("biryani_box_cart"), []);

// One cart per table: a guest who scanned Table 6's QR only ever sees Table 6's
// items, so two tables scanned on the same device never share a cart. The ""
// bucket is the regular online / takeaway cart.
const getTableCarts = () => {
  const stored = safeParseJSON(safeGet(TABLE_CARTS_KEY), null);
  if (stored && typeof stored === "object" && !Array.isArray(stored)) return stored;
  return { "": getLocalCart() }; // migrate the pre-table-bucket cart
};

export const CartProvider = ({ children }) => {
  const [tableNumber, setTableNumber] = useState(() => safeGet("biryani_box_table", ""));
  const [carts, setCarts] = useState(getTableCarts);
  const [syncing, setSyncing] = useState(false);
  const dbLoadAttempted = useRef(false);

  // Active bucket — the scanned table, or "" for a normal online cart
  const tableKey = String(tableNumber || "").trim();
  const inTableSession = !!tableKey;
  const cart = carts[tableKey] || [];

  // Write through to the active table's own bucket
  const setCart = useCallback((updater) => {
    setCarts(prev => {
      const current = prev[tableKey] || [];
      const next = typeof updater === "function" ? updater(current) : updater;
      return { ...prev, [tableKey]: next };
    });
  }, [tableKey]);

  useEffect(() => { safeSet("biryani_box_table", tableNumber); }, [tableNumber]);

  useEffect(() => {
    safeSet(TABLE_CARTS_KEY, JSON.stringify(carts));
    safeSet("biryani_box_cart", JSON.stringify(carts[""] || []));
  }, [carts]);

  const loadCartFromDB = useCallback(async (force = false) => {
    // A table session is device-local — never let the account cart leak into it
    if (String(safeGet("biryani_box_table", "") || "").trim()) return;
    if (!isCustomerLoggedIn()) { setCart(getLocalCart()); return; }
    if (dbLoadAttempted.current && !force) return;
    dbLoadAttempted.current = true;
    try {
      setSyncing(true);
      const res = await cartAPI.get();
      const items = (res.data || []).map(i => ({
        _id: i.menu_item_id?._id || i.menu_item_id,
        id:  i.menu_item_id?._id || i.menu_item_id,
        name: i.menu_item_id?.name || i.name || "Item",
        price: i.menu_item_id?.price || 0,
        image_url: i.menu_item_id?.image_url || "",
        category: i.menu_item_id?.category || "",
        quantity: i.quantity,
        cart_item_id: i._id,
      }));
      setCart(items);
    } catch (err) {
      if (!err?.message?.includes("401") && !err?.message?.includes("403")) {
        console.warn("[CartContext] DB load failed, using local:", err?.message);
      }
      setCart(getLocalCart());
    } finally { setSyncing(false); }
  }, []);

  useEffect(() => { loadCartFromDB(); }, [loadCartFromDB]);

  useEffect(() => {
    const refresh = () => { dbLoadAttempted.current = false; loadCartFromDB(true); };
    window.addEventListener("bb:login", refresh);
    window.addEventListener("bb:logout", refresh);
    window.addEventListener("bb:unauthorized", refresh);
    return () => {
      window.removeEventListener("bb:login", refresh);
      window.removeEventListener("bb:logout", refresh);
      window.removeEventListener("bb:unauthorized", refresh);
    };
  }, [loadCartFromDB]);

  const addToCart = async (item) => {
    const id = item._id || item.id;
    setCart(prev => {
      const ex = prev.find(i => (i._id || i.id) === id);
      if (ex) return prev.map(i => (i._id || i.id) === id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { ...item, id, _id: id, quantity: 1 }];
    });
    // Table carts stay local to the device that scanned the QR
    if (inTableSession || !isCustomerLoggedIn()) return;
    try { await cartAPI.add(id, 1); }
    catch { await loadCartFromDB(true); }
  };

  const removeFromCart = async (itemId) => {
    const ex = cart.find(i => (i._id || i.id) === itemId);
    if (!ex) return;
    const newQty = ex.quantity - 1;
    setCart(prev => newQty <= 0
      ? prev.filter(i => (i._id || i.id) !== itemId)
      : prev.map(i => (i._id || i.id) === itemId ? { ...i, quantity: newQty } : i));
    if (inTableSession || !isCustomerLoggedIn()) return;
    try {
      if (newQty <= 0) await cartAPI.remove(itemId);
      else await cartAPI.update(itemId, newQty);
    } catch { await loadCartFromDB(true); }
  };

  const clearCart = async () => {
    setCart([]);
    if (inTableSession || !isCustomerLoggedIn()) return;
    try { await cartAPI.clear(); } catch {}
  };

  const total = cart.reduce((sum, item) => sum + (item.price || 0) * item.quantity, 0);

  return (
    <CartContext.Provider value={{ cart, addToCart, removeFromCart, clearCart, total, tableNumber, setTableNumber, syncing }}>
      {children}
    </CartContext.Provider>
  );
};