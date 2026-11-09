from anvil import *

from ._anvil_designer import AlbumTemplate
from ... import cft


class Album(AlbumTemplate):
    """#album: the sticker album (13 sets of 6, each full set gives a bonus forever) and the photos taken on photo
    missions (kept in this browser only). Anyone can look."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        cft.prepare()
        v = cft.view("album")
        self.lead.text = v["lead"]
        self.total_bar.value = v["pct"]
        self.sets_panel.items = v["sets"]
        self.photos_panel.items = v["photos"]
        self.photos_empty.visible = not v["photos"]
