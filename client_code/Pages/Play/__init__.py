from anvil import *

from ._anvil_designer import PlayTemplate


class Play(PlayTemplate):
    """#play: the 3D game, full screen (no header or footer). Anyone can play: guests save in this browser,
    members also save to the server. Everything happens in Components/Game (the JavaScript engine)."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
