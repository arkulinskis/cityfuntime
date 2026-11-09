from anvil import *

from ._anvil_designer import PhotoTemplate


class Photo(PhotoTemplate):
    """Album: a snapshot from a photo mission (kept in this browser only). item = {url, caption, meta}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        img = self.dom_nodes["img"]
        img.setAttribute("src", self.item.get("url") or "")
        img.setAttribute("alt", self.item.get("caption") or "A photo from the game")
