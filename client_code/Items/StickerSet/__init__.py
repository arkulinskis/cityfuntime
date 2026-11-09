from anvil import *

from ._anvil_designer import StickerSetTemplate
from ... import state


class StickerSet(StickerSetTemplate):
    """Album: one sticker set (6 stickers + its bonus). item = {title, bonus, done, stickers}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        state.heading(self.title, 2)
        self.dom_nodes["card"].className = "cf-sticker-card al-set" + (" done" if self.item.get("done") else "")
        self.stickers_panel.items = self.item.get("stickers") or []
