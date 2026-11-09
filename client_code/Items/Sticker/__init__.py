from anvil import *

from ._anvil_designer import StickerTemplate


class Sticker(StickerTemplate):
    """Album: one sticker, got or still a "?". item = {e, got, count, name, odd}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        it, n = self.item, self.dom_nodes
        n["st"].className = "al-st" + (" got" if it.get("got") else "") + (" odd" if it.get("odd") else "")
        n["st"].setAttribute("title", it.get("name") or "")
        n["st"].setAttribute("role", "img")
        n["st"].setAttribute("aria-label", (it.get("name") or "Sticker") + ("" if it.get("got") else " (not found yet)"))
        n["e"].textContent = it.get("e") or ""
        n["e"].setAttribute("aria-hidden", "true")
        n["n"].textContent = it.get("count") or ""
        n["n"].style.display = "" if it.get("count") else "none"
