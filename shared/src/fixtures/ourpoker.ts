// The OurPoker recipe as slots, and the catalogue entries of the 39 components it prefers, as the catalogue served them
// on 2026-11-10 in the names of papers/package-urls.md, with every port id the name of its type. Trimmed to the fields the diagrams read.
// Test data only.
import type { ClassInterface, Port, Targets } from "../catalogue.js";
import type { Condition } from "../conditions.js";

export interface FixtureComponent { name: string; version: string; category: string | null; targets: Targets; provides: Port[]; requires: Port[]; profiles: { id: string; settings: Record<string, string | number | boolean> }[] }

export interface FixtureSlot { id: string; class: { provides: ClassInterface[]; requires: ClassInterface[] }; preferred: { name: string; version: string }; includedWhen: Condition | null }

export const OURPOKER_RECIPE: { name: string; version: string; title: string; components: FixtureSlot[]; connections: { source: { instance: string; port: string }; target: { instance: string; port: string } }[] } = {
 "name": "pkg:clod/com.clodhub/ourpoker-recipe",
 "version": "0.3.3",
 "title": "OurPoker",
 "components": [
  {
   "id": "web-host",
   "class": {
    "provides": [
     {
      "type": "com.clodhub/web-shell",
      "version": "1.0.0"
     }
    ],
    "requires": [
     {
      "type": "com.clodhub/theme",
      "version": "1.0.0"
     }
    ]
   },
   "preferred": {
    "name": "pkg:clod/com.clodhub/web-host",
    "version": "0.3.0"
   },
   "includedWhen": "'web' in targets"
  },
  {
   "id": "apple-host",
   "class": {
    "provides": [
     {
      "type": "com.clodhub/apple-shell",
      "version": "1.0.0"
     }
    ],
    "requires": [
     {
      "type": "com.clodhub/theme",
      "version": "1.0.0"
     }
    ]
   },
   "preferred": {
    "name": "pkg:clod/com.clodhub/apple-host",
    "version": "0.4.0"
   },
   "includedWhen": "'ios' in targets || 'macos' in targets || 'tvos' in targets"
  },
  {
   "id": "android-host",
   "class": {
    "provides": [
     {
      "type": "com.clodhub/android-shell",
      "version": "1.0.0"
     }
    ],
    "requires": [
     {
      "type": "com.clodhub/theme",
      "version": "1.0.0"
     }
    ]
   },
   "preferred": {
    "name": "pkg:clod/com.clodhub/android-host",
    "version": "0.3.0"
   },
   "includedWhen": "'android' in targets"
  },
  {
   "id": "windows-desktop",
   "class": {
    "provides": [
     {
      "type": "com.clodhub/desktop-host",
      "version": "1.0.0"
     }
    ],
    "requires": []
   },
   "preferred": {
    "name": "pkg:clod/com.clodhub/windows-desktop",
    "version": "0.4.0"
   },
   "includedWhen": "'windows' in targets"
  },
  {
   "id": "server-host",
   "class": {
    "provides": [
     {
      "type": "com.clodhub/server-host",
      "version": "1.0.0"
     }
    ],
    "requires": [
     {
      "type": "com.clodhub/room-session",
      "version": "1.0.0"
     },
     {
      "type": "com.clodhub/room-directory",
      "version": "1.0.0"
     }
    ]
   },
   "preferred": {
    "name": "pkg:clod/com.clodhub/server-host",
    "version": "0.4.0"
   },
   "includedWhen": null
  },
  {
   "id": "ourapps-release",
   "class": {
    "provides": [
     {
      "type": "com.clodhub/release-pipeline",
      "version": "1.0.0"
     }
    ],
    "requires": []
   },
   "preferred": {
    "name": "pkg:clod/com.clodhub/ourapps-release",
    "version": "0.3.0"
   },
   "includedWhen": null
  },
  {
   "id": "store-update",
   "class": {
    "provides": [
     {
      "type": "com.clodhub/updates",
      "version": "1.0.0"
     }
    ],
    "requires": []
   },
   "preferred": {
    "name": "pkg:clod/com.clodhub/store-update",
    "version": "0.4.0"
   },
   "includedWhen": "updates"
  },
  {
   "id": "realtime-rooms",
   "class": {
    "provides": [
     {
      "type": "com.clodhub/room-session",
      "version": "1.0.0"
     }
    ],
    "requires": [
     {
      "type": "com.clodhub/game-adapter",
      "version": "1.0.0"
     },
     {
      "type": "com.clodhub/guest-identity",
      "version": "1.0.0"
     }
    ]
   },
   "preferred": {
    "name": "pkg:clod/com.clodhub/realtime-rooms",
    "version": "0.5.0"
   },
   "includedWhen": null
  },
  {
   "id": "room-directory",
   "class": {
    "provides": [
     {
      "type": "com.clodhub/room-directory",
      "version": "1.0.0"
     }
    ],
    "requires": [
     {
      "type": "com.clodhub/room-session",
      "version": "1.0.0"
     }
    ]
   },
   "preferred": {
    "name": "pkg:clod/com.clodhub/room-directory",
    "version": "0.3.0"
   },
   "includedWhen": null
  },
  {
   "id": "guest-identity",
   "class": {
    "provides": [
     {
      "type": "com.clodhub/guest-identity",
      "version": "1.0.0"
     }
    ],
    "requires": []
   },
   "preferred": {
    "name": "pkg:clod/com.clodhub/guest-identity",
    "version": "0.4.0"
   },
   "includedWhen": null
  },
  {
   "id": "presence",
   "class": {
    "provides": [
     {
      "type": "com.clodhub/presence",
      "version": "1.0.0"
     }
    ],
    "requires": [
     {
      "type": "com.clodhub/guest-identity",
      "version": "1.0.0"
     }
    ]
   },
   "preferred": {
    "name": "pkg:clod/com.clodhub/presence",
    "version": "0.3.0"
   },
   "includedWhen": null
  },
  {
   "id": "invitations",
   "class": {
    "provides": [
     {
      "type": "com.clodhub/invitations",
      "version": "1.0.0"
     }
    ],
    "requires": []
   },
   "preferred": {
    "name": "pkg:clod/com.clodhub/invitations",
    "version": "0.1.1"
   },
   "includedWhen": null
  },
  {
   "id": "private-views",
   "class": {
    "provides": [
     {
      "type": "com.clodhub/private-views",
      "version": "1.0.0"
     }
    ],
    "requires": []
   },
   "preferred": {
    "name": "pkg:clod/com.clodhub/private-views",
    "version": "0.3.0"
   },
   "includedWhen": null
  },
  {
   "id": "display-mode",
   "class": {
    "provides": [
     {
      "type": "com.clodhub/display-policy",
      "version": "1.0.0"
     }
    ],
    "requires": []
   },
   "preferred": {
    "name": "pkg:clod/com.clodhub/display-mode",
    "version": "0.4.0"
   },
   "includedWhen": null
  },
  {
   "id": "video-calls",
   "class": {
    "provides": [
     {
      "type": "com.clodhub/media-session",
      "version": "1.0.0"
     }
    ],
    "requires": []
   },
   "preferred": {
    "name": "pkg:clod/com.clodhub/video-calls",
    "version": "0.4.0"
   },
   "includedWhen": "video"
  },
  {
   "id": "preferences",
   "class": {
    "provides": [
     {
      "type": "com.clodhub/preferences",
      "version": "1.0.0"
     }
    ],
    "requires": []
   },
   "preferred": {
    "name": "pkg:clod/com.clodhub/preferences",
    "version": "0.1.1"
   },
   "includedWhen": null
  },
  {
   "id": "turn-engine",
   "class": {
    "provides": [
     {
      "type": "com.clodhub/game-adapter",
      "version": "1.0.0"
     }
    ],
    "requires": [
     {
      "type": "com.clodhub/game-rules",
      "version": "1.0.0"
     },
     {
      "type": "com.clodhub/seating",
      "version": "1.0.0"
     },
     {
      "type": "com.clodhub/game-clock",
      "version": "1.0.0"
     },
     {
      "type": "com.clodhub/private-views",
      "version": "1.0.0"
     },
     {
      "type": "com.clodhub/presence",
      "version": "1.0.0"
     },
     {
      "type": "com.clodhub/tournament",
      "version": "1.0.0"
     },
     {
      "type": "com.clodhub/computer-players",
      "version": "1.0.0",
      "optional": true
     },
     {
      "type": "com.clodhub/round-history",
      "version": "1.0.0"
     },
     {
      "type": "com.clodhub/rules-settings",
      "version": "1.0.0"
     }
    ]
   },
   "preferred": {
    "name": "pkg:clod/com.clodhub/turn-engine",
    "version": "0.4.0"
   },
   "includedWhen": null
  },
  {
   "id": "game-clock",
   "class": {
    "provides": [
     {
      "type": "com.clodhub/game-clock",
      "version": "1.0.0"
     }
    ],
    "requires": []
   },
   "preferred": {
    "name": "pkg:clod/com.clodhub/game-clock",
    "version": "0.3.0"
   },
   "includedWhen": null
  },
  {
   "id": "seating",
   "class": {
    "provides": [
     {
      "type": "com.clodhub/seating",
      "version": "1.0.0"
     }
    ],
    "requires": [
     {
      "type": "com.clodhub/guest-identity",
      "version": "1.0.0"
     }
    ]
   },
   "preferred": {
    "name": "pkg:clod/com.clodhub/seating",
    "version": "0.3.0"
   },
   "includedWhen": null
  },
  {
   "id": "fair-shuffle",
   "class": {
    "provides": [
     {
      "type": "com.clodhub/random-source",
      "version": "1.0.0"
     }
    ],
    "requires": []
   },
   "preferred": {
    "name": "pkg:clod/com.clodhub/fair-shuffle",
    "version": "0.3.0"
   },
   "includedWhen": null
  },
  {
   "id": "card-deck",
   "class": {
    "provides": [
     {
      "type": "com.clodhub/card-deck",
      "version": "1.0.0"
     }
    ],
    "requires": [
     {
      "type": "com.clodhub/random-source",
      "version": "1.0.0"
     }
    ]
   },
   "preferred": {
    "name": "pkg:clod/com.clodhub/card-deck",
    "version": "0.3.0"
   },
   "includedWhen": null
  },
  {
   "id": "computer-players",
   "class": {
    "provides": [
     {
      "type": "com.clodhub/computer-players",
      "version": "1.0.0"
     }
    ],
    "requires": [
     {
      "type": "com.clodhub/player-strategy",
      "version": "1.0.0"
     },
     {
      "type": "com.clodhub/game-clock",
      "version": "1.0.0"
     },
     {
      "type": "com.clodhub/seating",
      "version": "1.0.0"
     }
    ]
   },
   "preferred": {
    "name": "pkg:clod/com.clodhub/computer-players",
    "version": "0.4.0"
   },
   "includedWhen": "computerPlayers != 'none'"
  },
  {
   "id": "chip-ledger",
   "class": {
    "provides": [
     {
      "type": "com.clodhub/chip-ledger",
      "version": "1.0.0"
     }
    ],
    "requires": []
   },
   "preferred": {
    "name": "pkg:clod/com.clodhub/chip-ledger",
    "version": "0.4.0"
   },
   "includedWhen": null
  },
  {
   "id": "level-schedule",
   "class": {
    "provides": [
     {
      "type": "com.clodhub/level-schedule",
      "version": "1.0.0"
     }
    ],
    "requires": []
   },
   "preferred": {
    "name": "pkg:clod/com.clodhub/level-schedule",
    "version": "0.3.0"
   },
   "includedWhen": null
  },
  {
   "id": "tournament",
   "class": {
    "provides": [
     {
      "type": "com.clodhub/tournament",
      "version": "1.0.0"
     }
    ],
    "requires": [
     {
      "type": "com.clodhub/chip-ledger",
      "version": "1.0.0"
     },
     {
      "type": "com.clodhub/level-schedule",
      "version": "1.0.0"
     },
     {
      "type": "com.clodhub/seating",
      "version": "1.0.0"
     }
    ]
   },
   "preferred": {
    "name": "pkg:clod/com.clodhub/tournament",
    "version": "0.3.0"
   },
   "includedWhen": null
  },
  {
   "id": "round-history",
   "class": {
    "provides": [
     {
      "type": "com.clodhub/round-history",
      "version": "1.0.0"
     }
    ],
    "requires": []
   },
   "preferred": {
    "name": "pkg:clod/com.clodhub/round-history",
    "version": "0.3.0"
   },
   "includedWhen": null
  },
  {
   "id": "rules-settings",
   "class": {
    "provides": [
     {
      "type": "com.clodhub/rules-settings",
      "version": "1.0.0"
     }
    ],
    "requires": []
   },
   "preferred": {
    "name": "pkg:clod/com.clodhub/rules-settings",
    "version": "0.3.0"
   },
   "includedWhen": null
  },
  {
   "id": "poker-hand-ranking",
   "class": {
    "provides": [
     {
      "type": "com.clodhub/hand-ranking",
      "version": "1.0.0"
     }
    ],
    "requires": [
     {
      "type": "com.clodhub/card-deck",
      "version": "1.0.0"
     }
    ]
   },
   "preferred": {
    "name": "pkg:clod/com.clodhub/poker-hand-ranking",
    "version": "0.3.0"
   },
   "includedWhen": null
  },
  {
   "id": "poker-odds",
   "class": {
    "provides": [
     {
      "type": "com.clodhub/poker-odds",
      "version": "1.0.0"
     }
    ],
    "requires": [
     {
      "type": "com.clodhub/hand-ranking",
      "version": "1.0.0"
     },
     {
      "type": "com.clodhub/card-deck",
      "version": "1.0.0"
     }
    ]
   },
   "preferred": {
    "name": "pkg:clod/com.clodhub/poker-odds",
    "version": "0.3.0"
   },
   "includedWhen": null
  },
  {
   "id": "holdem-rules",
   "class": {
    "provides": [
     {
      "type": "com.clodhub/game-rules",
      "version": "1.0.0"
     }
    ],
    "requires": [
     {
      "type": "com.clodhub/card-deck",
      "version": "1.0.0"
     },
     {
      "type": "com.clodhub/chip-ledger",
      "version": "1.0.0"
     },
     {
      "type": "com.clodhub/level-schedule",
      "version": "1.0.0"
     },
     {
      "type": "com.clodhub/hand-ranking",
      "version": "1.0.0"
     },
     {
      "type": "com.clodhub/rules-settings",
      "version": "1.0.0"
     }
    ]
   },
   "preferred": {
    "name": "pkg:clod/com.clodhub/holdem-rules",
    "version": "0.3.0"
   },
   "includedWhen": null
  },
  {
   "id": "poker-strategy",
   "class": {
    "provides": [
     {
      "type": "com.clodhub/player-strategy",
      "version": "1.0.0"
     }
    ],
    "requires": [
     {
      "type": "com.clodhub/hand-ranking",
      "version": "1.0.0"
     },
     {
      "type": "com.clodhub/poker-odds",
      "version": "1.0.0"
     }
    ]
   },
   "preferred": {
    "name": "pkg:clod/com.clodhub/poker-strategy",
    "version": "0.3.0"
   },
   "includedWhen": "computerPlayers != 'none'"
  },
  {
   "id": "theme",
   "class": {
    "provides": [
     {
      "type": "com.clodhub/theme",
      "version": "1.0.0"
     }
    ],
    "requires": []
   },
   "preferred": {
    "name": "pkg:clod/com.clodhub/theme",
    "version": "0.3.0"
   },
   "includedWhen": null
  },
  {
   "id": "controls",
   "class": {
    "provides": [
     {
      "type": "com.clodhub/controls",
      "version": "1.0.0"
     }
    ],
    "requires": [
     {
      "type": "com.clodhub/theme",
      "version": "1.0.0"
     }
    ]
   },
   "preferred": {
    "name": "pkg:clod/com.clodhub/controls",
    "version": "0.3.0"
   },
   "includedWhen": null
  },
  {
   "id": "table-layout",
   "class": {
    "provides": [
     {
      "type": "com.clodhub/table-layout",
      "version": "1.0.0"
     }
    ],
    "requires": [
     {
      "type": "com.clodhub/theme",
      "version": "1.0.0"
     },
     {
      "type": "com.clodhub/controls",
      "version": "1.0.0"
     }
    ]
   },
   "preferred": {
    "name": "pkg:clod/com.clodhub/table-layout",
    "version": "0.3.0"
   },
   "includedWhen": null
  },
  {
   "id": "card-graphics",
   "class": {
    "provides": [
     {
      "type": "com.clodhub/card-graphics",
      "version": "1.0.0"
     }
    ],
    "requires": [
     {
      "type": "com.clodhub/theme",
      "version": "1.0.0"
     }
    ]
   },
   "preferred": {
    "name": "pkg:clod/com.clodhub/card-graphics",
    "version": "0.3.0"
   },
   "includedWhen": null
  },
  {
   "id": "chip-graphics",
   "class": {
    "provides": [
     {
      "type": "com.clodhub/chip-graphics",
      "version": "1.0.0"
     }
    ],
    "requires": [
     {
      "type": "com.clodhub/theme",
      "version": "1.0.0"
     }
    ]
   },
   "preferred": {
    "name": "pkg:clod/com.clodhub/chip-graphics",
    "version": "0.3.0"
   },
   "includedWhen": null
  },
  {
   "id": "sound-cues",
   "class": {
    "provides": [
     {
      "type": "com.clodhub/sound-cues",
      "version": "1.0.0"
     }
    ],
    "requires": [
     {
      "type": "com.clodhub/preferences",
      "version": "1.0.0"
     }
    ]
   },
   "preferred": {
    "name": "pkg:clod/com.clodhub/sound-cues",
    "version": "0.3.0"
   },
   "includedWhen": null
  },
  {
   "id": "guided-tour",
   "class": {
    "provides": [
     {
      "type": "com.clodhub/guided-tour",
      "version": "1.0.0"
     }
    ],
    "requires": [
     {
      "type": "com.clodhub/controls",
      "version": "1.0.0"
     },
     {
      "type": "com.clodhub/preferences",
      "version": "1.0.0"
     },
     {
      "type": "com.clodhub/language",
      "version": "1.0.0"
     }
    ]
   },
   "preferred": {
    "name": "pkg:clod/com.clodhub/guided-tour",
    "version": "0.3.0"
   },
   "includedWhen": "lessons"
  },
  {
   "id": "translations",
   "class": {
    "provides": [
     {
      "type": "com.clodhub/language",
      "version": "1.0.0"
     }
    ],
    "requires": []
   },
   "preferred": {
    "name": "pkg:clod/com.clodhub/translations",
    "version": "0.4.0"
   },
   "includedWhen": null
  }
 ],
 "connections": [
  {
   "source": {
    "instance": "theme",
    "port": "theme"
   },
   "target": {
    "instance": "web-host",
    "port": "theme"
   }
  },
  {
   "source": {
    "instance": "theme",
    "port": "theme"
   },
   "target": {
    "instance": "apple-host",
    "port": "theme"
   }
  },
  {
   "source": {
    "instance": "theme",
    "port": "theme"
   },
   "target": {
    "instance": "android-host",
    "port": "theme"
   }
  },
  {
   "source": {
    "instance": "realtime-rooms",
    "port": "room-session"
   },
   "target": {
    "instance": "server-host",
    "port": "room-session"
   }
  },
  {
   "source": {
    "instance": "room-directory",
    "port": "room-directory"
   },
   "target": {
    "instance": "server-host",
    "port": "room-directory"
   }
  },
  {
   "source": {
    "instance": "application",
    "port": "poker-game-adapter"
   },
   "target": {
    "instance": "realtime-rooms",
    "port": "game-adapter"
   }
  },
  {
   "source": {
    "instance": "guest-identity",
    "port": "guest-identity"
   },
   "target": {
    "instance": "realtime-rooms",
    "port": "guest-identity"
   }
  },
  {
   "source": {
    "instance": "realtime-rooms",
    "port": "room-session"
   },
   "target": {
    "instance": "room-directory",
    "port": "room-session"
   }
  },
  {
   "source": {
    "instance": "guest-identity",
    "port": "guest-identity"
   },
   "target": {
    "instance": "presence",
    "port": "guest-identity"
   }
  },
  {
   "source": {
    "instance": "holdem-rules",
    "port": "game-rules"
   },
   "target": {
    "instance": "turn-engine",
    "port": "game-rules"
   }
  },
  {
   "source": {
    "instance": "seating",
    "port": "seating"
   },
   "target": {
    "instance": "turn-engine",
    "port": "seating"
   }
  },
  {
   "source": {
    "instance": "game-clock",
    "port": "game-clock"
   },
   "target": {
    "instance": "turn-engine",
    "port": "game-clock"
   }
  },
  {
   "source": {
    "instance": "private-views",
    "port": "private-views"
   },
   "target": {
    "instance": "turn-engine",
    "port": "private-views"
   }
  },
  {
   "source": {
    "instance": "presence",
    "port": "presence"
   },
   "target": {
    "instance": "turn-engine",
    "port": "presence"
   }
  },
  {
   "source": {
    "instance": "tournament",
    "port": "tournament"
   },
   "target": {
    "instance": "turn-engine",
    "port": "tournament"
   }
  },
  {
   "source": {
    "instance": "computer-players",
    "port": "computer-players"
   },
   "target": {
    "instance": "turn-engine",
    "port": "computer-players"
   }
  },
  {
   "source": {
    "instance": "round-history",
    "port": "round-history"
   },
   "target": {
    "instance": "turn-engine",
    "port": "round-history"
   }
  },
  {
   "source": {
    "instance": "rules-settings",
    "port": "rules-settings"
   },
   "target": {
    "instance": "turn-engine",
    "port": "rules-settings"
   }
  },
  {
   "source": {
    "instance": "guest-identity",
    "port": "guest-identity"
   },
   "target": {
    "instance": "seating",
    "port": "guest-identity"
   }
  },
  {
   "source": {
    "instance": "fair-shuffle",
    "port": "random-source"
   },
   "target": {
    "instance": "card-deck",
    "port": "random-source"
   }
  },
  {
   "source": {
    "instance": "poker-strategy",
    "port": "player-strategy"
   },
   "target": {
    "instance": "computer-players",
    "port": "player-strategy"
   }
  },
  {
   "source": {
    "instance": "game-clock",
    "port": "game-clock"
   },
   "target": {
    "instance": "computer-players",
    "port": "game-clock"
   }
  },
  {
   "source": {
    "instance": "seating",
    "port": "seating"
   },
   "target": {
    "instance": "computer-players",
    "port": "seating"
   }
  },
  {
   "source": {
    "instance": "chip-ledger",
    "port": "chip-ledger"
   },
   "target": {
    "instance": "tournament",
    "port": "chip-ledger"
   }
  },
  {
   "source": {
    "instance": "level-schedule",
    "port": "level-schedule"
   },
   "target": {
    "instance": "tournament",
    "port": "level-schedule"
   }
  },
  {
   "source": {
    "instance": "seating",
    "port": "seating"
   },
   "target": {
    "instance": "tournament",
    "port": "seating"
   }
  },
  {
   "source": {
    "instance": "card-deck",
    "port": "card-deck"
   },
   "target": {
    "instance": "poker-hand-ranking",
    "port": "card-deck"
   }
  },
  {
   "source": {
    "instance": "poker-hand-ranking",
    "port": "hand-ranking"
   },
   "target": {
    "instance": "poker-odds",
    "port": "hand-ranking"
   }
  },
  {
   "source": {
    "instance": "card-deck",
    "port": "card-deck"
   },
   "target": {
    "instance": "poker-odds",
    "port": "card-deck"
   }
  },
  {
   "source": {
    "instance": "card-deck",
    "port": "card-deck"
   },
   "target": {
    "instance": "holdem-rules",
    "port": "card-deck"
   }
  },
  {
   "source": {
    "instance": "chip-ledger",
    "port": "chip-ledger"
   },
   "target": {
    "instance": "holdem-rules",
    "port": "chip-ledger"
   }
  },
  {
   "source": {
    "instance": "level-schedule",
    "port": "level-schedule"
   },
   "target": {
    "instance": "holdem-rules",
    "port": "level-schedule"
   }
  },
  {
   "source": {
    "instance": "poker-hand-ranking",
    "port": "hand-ranking"
   },
   "target": {
    "instance": "holdem-rules",
    "port": "hand-ranking"
   }
  },
  {
   "source": {
    "instance": "rules-settings",
    "port": "rules-settings"
   },
   "target": {
    "instance": "holdem-rules",
    "port": "rules-settings"
   }
  },
  {
   "source": {
    "instance": "poker-hand-ranking",
    "port": "hand-ranking"
   },
   "target": {
    "instance": "poker-strategy",
    "port": "hand-ranking"
   }
  },
  {
   "source": {
    "instance": "poker-odds",
    "port": "poker-odds"
   },
   "target": {
    "instance": "poker-strategy",
    "port": "poker-odds"
   }
  },
  {
   "source": {
    "instance": "theme",
    "port": "theme"
   },
   "target": {
    "instance": "controls",
    "port": "theme"
   }
  },
  {
   "source": {
    "instance": "theme",
    "port": "theme"
   },
   "target": {
    "instance": "table-layout",
    "port": "theme"
   }
  },
  {
   "source": {
    "instance": "controls",
    "port": "controls"
   },
   "target": {
    "instance": "table-layout",
    "port": "controls"
   }
  },
  {
   "source": {
    "instance": "theme",
    "port": "theme"
   },
   "target": {
    "instance": "card-graphics",
    "port": "theme"
   }
  },
  {
   "source": {
    "instance": "theme",
    "port": "theme"
   },
   "target": {
    "instance": "chip-graphics",
    "port": "theme"
   }
  },
  {
   "source": {
    "instance": "preferences",
    "port": "preferences"
   },
   "target": {
    "instance": "sound-cues",
    "port": "preferences"
   }
  },
  {
   "source": {
    "instance": "controls",
    "port": "controls"
   },
   "target": {
    "instance": "guided-tour",
    "port": "controls"
   }
  },
  {
   "source": {
    "instance": "preferences",
    "port": "preferences"
   },
   "target": {
    "instance": "guided-tour",
    "port": "preferences"
   }
  },
  {
   "source": {
    "instance": "translations",
    "port": "language"
   },
   "target": {
    "instance": "guided-tour",
    "port": "language"
   }
  },
  {
   "source": {
    "instance": "turn-engine",
    "port": "game-adapter"
   },
   "target": {
    "instance": "application",
    "port": "game-adapter"
   }
  },
  {
   "source": {
    "instance": "web-host",
    "port": "web-shell"
   },
   "target": {
    "instance": "application",
    "port": "web-shell"
   }
  },
  {
   "source": {
    "instance": "apple-host",
    "port": "apple-shell"
   },
   "target": {
    "instance": "application",
    "port": "apple-shell"
   }
  },
  {
   "source": {
    "instance": "android-host",
    "port": "android-shell"
   },
   "target": {
    "instance": "application",
    "port": "android-shell"
   }
  },
  {
   "source": {
    "instance": "windows-desktop",
    "port": "desktop-host"
   },
   "target": {
    "instance": "application",
    "port": "desktop-host"
   }
  },
  {
   "source": {
    "instance": "server-host",
    "port": "server-host"
   },
   "target": {
    "instance": "application",
    "port": "server-host"
   }
  },
  {
   "source": {
    "instance": "ourapps-release",
    "port": "release-pipeline"
   },
   "target": {
    "instance": "application",
    "port": "release-pipeline"
   }
  },
  {
   "source": {
    "instance": "invitations",
    "port": "invitations"
   },
   "target": {
    "instance": "application",
    "port": "invitations"
   }
  },
  {
   "source": {
    "instance": "display-mode",
    "port": "display-policy"
   },
   "target": {
    "instance": "application",
    "port": "display-policy"
   }
  },
  {
   "source": {
    "instance": "video-calls",
    "port": "media-session"
   },
   "target": {
    "instance": "application",
    "port": "media-session"
   }
  },
  {
   "source": {
    "instance": "table-layout",
    "port": "table-layout"
   },
   "target": {
    "instance": "application",
    "port": "table-layout"
   }
  },
  {
   "source": {
    "instance": "card-graphics",
    "port": "card-graphics"
   },
   "target": {
    "instance": "application",
    "port": "card-graphics"
   }
  },
  {
   "source": {
    "instance": "chip-graphics",
    "port": "chip-graphics"
   },
   "target": {
    "instance": "application",
    "port": "chip-graphics"
   }
  },
  {
   "source": {
    "instance": "sound-cues",
    "port": "sound-cues"
   },
   "target": {
    "instance": "application",
    "port": "sound-cues"
   }
  },
  {
   "source": {
    "instance": "guided-tour",
    "port": "guided-tour"
   },
   "target": {
    "instance": "application",
    "port": "guided-tour"
   }
  },
  {
   "source": {
    "instance": "store-update",
    "port": "updates"
   },
   "target": {
    "instance": "application",
    "port": "updates"
   }
  },
  {
   "source": {
    "instance": "controls",
    "port": "controls"
   },
   "target": {
    "instance": "application",
    "port": "controls"
   }
  },
  {
   "source": {
    "instance": "preferences",
    "port": "preferences"
   },
   "target": {
    "instance": "application",
    "port": "preferences"
   }
  },
  {
   "source": {
    "instance": "translations",
    "port": "language"
   },
   "target": {
    "instance": "application",
    "port": "language"
   }
  },
  {
   "source": {
    "instance": "theme",
    "port": "theme"
   },
   "target": {
    "instance": "application",
    "port": "theme"
   }
  }
 ]
};

export const OURPOKER_CATALOGUE: FixtureComponent[] = [
 {
  "name": "pkg:clod/com.clodhub/android-host",
  "version": "0.3.0",
  "category": "delivery",
  "targets": {
   "client": [
    "android"
   ],
   "server": []
  },
  "provides": [
   {
    "id": "android-shell",
    "type": "com.clodhub/android-shell",
    "version": "1.0.0"
   }
  ],
  "requires": [
   {
    "id": "theme",
    "type": "com.clodhub/theme",
    "version": "1.0.0"
   }
  ],
  "profiles": [
   {
    "id": "any",
    "settings": {}
   }
  ]
 },
 {
  "name": "pkg:clod/com.clodhub/apple-host",
  "version": "0.4.0",
  "category": "delivery",
  "targets": {
   "client": [
    "ios",
    "macos",
    "tvos"
   ],
   "server": []
  },
  "provides": [
   {
    "id": "apple-shell",
    "type": "com.clodhub/apple-shell",
    "version": "1.0.0"
   }
  ],
  "requires": [
   {
    "id": "theme",
    "type": "com.clodhub/theme",
    "version": "1.0.0"
   }
  ],
  "profiles": [
   {
    "id": "any",
    "settings": {}
   }
  ]
 },
 {
  "name": "pkg:clod/com.clodhub/card-deck",
  "version": "0.3.0",
  "category": "game-framework",
  "targets": {
   "client": [
    "android",
    "ios",
    "macos",
    "tvos",
    "web"
   ],
   "server": []
  },
  "provides": [
   {
    "id": "card-deck",
    "type": "com.clodhub/card-deck",
    "version": "1.0.0"
   }
  ],
  "requires": [
   {
    "id": "random-source",
    "type": "com.clodhub/random-source",
    "version": "1.0.0"
   }
  ],
  "profiles": [
   {
    "id": "any",
    "settings": {}
   }
  ]
 },
 {
  "name": "pkg:clod/com.clodhub/card-graphics",
  "version": "0.3.0",
  "category": "presentation",
  "targets": {
   "client": [
    "android",
    "ios",
    "macos",
    "tvos",
    "web"
   ],
   "server": []
  },
  "provides": [
   {
    "id": "card-graphics",
    "type": "com.clodhub/card-graphics",
    "version": "1.0.0"
   }
  ],
  "requires": [
   {
    "id": "theme",
    "type": "com.clodhub/theme",
    "version": "1.0.0"
   }
  ],
  "profiles": [
   {
    "id": "any",
    "settings": {}
   }
  ]
 },
 {
  "name": "pkg:clod/com.clodhub/chip-graphics",
  "version": "0.3.0",
  "category": "presentation",
  "targets": {
   "client": [
    "android",
    "ios",
    "macos",
    "tvos",
    "web"
   ],
   "server": []
  },
  "provides": [
   {
    "id": "chip-graphics",
    "type": "com.clodhub/chip-graphics",
    "version": "1.0.0"
   }
  ],
  "requires": [
   {
    "id": "theme",
    "type": "com.clodhub/theme",
    "version": "1.0.0"
   }
  ],
  "profiles": [
   {
    "id": "any",
    "settings": {}
   }
  ]
 },
 {
  "name": "pkg:clod/com.clodhub/chip-ledger",
  "version": "0.4.0",
  "category": "game-framework",
  "targets": {
   "client": [],
   "server": []
  },
  "provides": [
   {
    "id": "chip-ledger",
    "type": "com.clodhub/chip-ledger",
    "version": "1.0.0"
   }
  ],
  "requires": [],
  "profiles": [
   {
    "id": "any",
    "settings": {}
   }
  ]
 },
 {
  "name": "pkg:clod/com.clodhub/computer-players",
  "version": "0.4.0",
  "category": "game-framework",
  "targets": {
   "client": [],
   "server": []
  },
  "provides": [
   {
    "id": "computer-players",
    "type": "com.clodhub/computer-players",
    "version": "1.0.0"
   }
  ],
  "requires": [
   {
    "id": "player-strategy",
    "type": "com.clodhub/player-strategy",
    "version": "1.0.0"
   },
   {
    "id": "game-clock",
    "type": "com.clodhub/game-clock",
    "version": "1.0.0"
   },
   {
    "id": "seating",
    "type": "com.clodhub/seating",
    "version": "1.0.0"
   }
  ],
  "profiles": [
   {
    "id": "any",
    "settings": {}
   }
  ]
 },
 {
  "name": "pkg:clod/com.clodhub/controls",
  "version": "0.3.0",
  "category": "presentation",
  "targets": {
   "client": [
    "android",
    "ios",
    "macos",
    "tvos",
    "web"
   ],
   "server": []
  },
  "provides": [
   {
    "id": "controls",
    "type": "com.clodhub/controls",
    "version": "1.0.0"
   }
  ],
  "requires": [
   {
    "id": "theme",
    "type": "com.clodhub/theme",
    "version": "1.0.0"
   }
  ],
  "profiles": [
   {
    "id": "any",
    "settings": {}
   }
  ]
 },
 {
  "name": "pkg:clod/com.clodhub/display-mode",
  "version": "0.4.0",
  "category": "rooms",
  "targets": {
   "client": [
    "android",
    "ios",
    "macos",
    "tvos",
    "web"
   ],
   "server": []
  },
  "provides": [
   {
    "id": "display-policy",
    "type": "com.clodhub/display-policy",
    "version": "1.0.0"
   }
  ],
  "requires": [
   {
    "id": "display-mode-configuration",
    "type": "com.clodhub/display-mode-configuration",
    "version": "1.0.0",
    "optional": true
   }
  ],
  "profiles": [
   {
    "id": "any",
    "settings": {}
   }
  ]
 },
 {
  "name": "pkg:clod/com.clodhub/fair-shuffle",
  "version": "0.3.0",
  "category": "game-framework",
  "targets": {
   "client": [],
   "server": []
  },
  "provides": [
   {
    "id": "random-source",
    "type": "com.clodhub/random-source",
    "version": "1.0.0"
   }
  ],
  "requires": [],
  "profiles": [
   {
    "id": "any",
    "settings": {}
   }
  ]
 },
 {
  "name": "pkg:clod/com.clodhub/game-clock",
  "version": "0.3.0",
  "category": "game-framework",
  "targets": {
   "client": [
    "android",
    "ios",
    "macos",
    "tvos",
    "web"
   ],
   "server": []
  },
  "provides": [
   {
    "id": "game-clock",
    "type": "com.clodhub/game-clock",
    "version": "1.0.0"
   }
  ],
  "requires": [],
  "profiles": [
   {
    "id": "any",
    "settings": {}
   }
  ]
 },
 {
  "name": "pkg:clod/com.clodhub/guest-identity",
  "version": "0.4.0",
  "category": "rooms",
  "targets": {
   "client": [
    "android",
    "ios",
    "macos",
    "tvos",
    "web"
   ],
   "server": []
  },
  "provides": [
   {
    "id": "guest-identity",
    "type": "com.clodhub/guest-identity",
    "version": "1.0.0"
   }
  ],
  "requires": [],
  "profiles": [
   {
    "id": "any",
    "settings": {}
   }
  ]
 },
 {
  "name": "pkg:clod/com.clodhub/guided-tour",
  "version": "0.3.0",
  "category": "presentation",
  "targets": {
   "client": [
    "android",
    "ios",
    "macos",
    "tvos",
    "web"
   ],
   "server": []
  },
  "provides": [
   {
    "id": "guided-tour",
    "type": "com.clodhub/guided-tour",
    "version": "1.0.0"
   }
  ],
  "requires": [
   {
    "id": "controls",
    "type": "com.clodhub/controls",
    "version": "1.0.0"
   },
   {
    "id": "preferences",
    "type": "com.clodhub/preferences",
    "version": "1.0.0"
   },
   {
    "id": "language",
    "type": "com.clodhub/language",
    "version": "1.0.0"
   }
  ],
  "profiles": [
   {
    "id": "any",
    "settings": {}
   }
  ]
 },
 {
  "name": "pkg:clod/com.clodhub/holdem-rules",
  "version": "0.3.0",
  "category": "poker",
  "targets": {
   "client": [
    "android",
    "ios",
    "macos",
    "tvos",
    "web"
   ],
   "server": []
  },
  "provides": [
   {
    "id": "game-rules",
    "type": "com.clodhub/game-rules",
    "version": "1.0.0"
   }
  ],
  "requires": [
   {
    "id": "card-deck",
    "type": "com.clodhub/card-deck",
    "version": "1.0.0"
   },
   {
    "id": "chip-ledger",
    "type": "com.clodhub/chip-ledger",
    "version": "1.0.0"
   },
   {
    "id": "level-schedule",
    "type": "com.clodhub/level-schedule",
    "version": "1.0.0"
   },
   {
    "id": "hand-ranking",
    "type": "com.clodhub/hand-ranking",
    "version": "1.0.0"
   },
   {
    "id": "rules-settings",
    "type": "com.clodhub/rules-settings",
    "version": "1.0.0"
   }
  ],
  "profiles": [
   {
    "id": "any",
    "settings": {}
   }
  ]
 },
 {
  "name": "pkg:clod/com.clodhub/invitations",
  "version": "0.1.1",
  "category": "rooms",
  "targets": {
   "client": [
    "android",
    "ios",
    "macos",
    "tvos",
    "web"
   ],
   "server": []
  },
  "provides": [
   {
    "id": "invitations",
    "type": "com.clodhub/invitations",
    "version": "1.0.0"
   }
  ],
  "requires": [],
  "profiles": [
   {
    "id": "any",
    "settings": {}
   }
  ]
 },
 {
  "name": "pkg:clod/com.clodhub/level-schedule",
  "version": "0.3.0",
  "category": "game-framework",
  "targets": {
   "client": [],
   "server": []
  },
  "provides": [
   {
    "id": "level-schedule",
    "type": "com.clodhub/level-schedule",
    "version": "1.0.0"
   }
  ],
  "requires": [],
  "profiles": [
   {
    "id": "any",
    "settings": {}
   }
  ]
 },
 {
  "name": "pkg:clod/com.clodhub/ourapps-release",
  "version": "0.3.0",
  "category": "delivery",
  "targets": {
   "client": [],
   "server": []
  },
  "provides": [
   {
    "id": "release-pipeline",
    "type": "com.clodhub/release-pipeline",
    "version": "1.0.0"
   }
  ],
  "requires": [],
  "profiles": [
   {
    "id": "any",
    "settings": {}
   }
  ]
 },
 {
  "name": "pkg:clod/com.clodhub/poker-hand-ranking",
  "version": "0.3.0",
  "category": "poker",
  "targets": {
   "client": [],
   "server": []
  },
  "provides": [
   {
    "id": "hand-ranking",
    "type": "com.clodhub/hand-ranking",
    "version": "1.0.0"
   }
  ],
  "requires": [
   {
    "id": "card-deck",
    "type": "com.clodhub/card-deck",
    "version": "1.0.0"
   }
  ],
  "profiles": [
   {
    "id": "any",
    "settings": {}
   }
  ]
 },
 {
  "name": "pkg:clod/com.clodhub/poker-odds",
  "version": "0.3.0",
  "category": "poker",
  "targets": {
   "client": [],
   "server": []
  },
  "provides": [
   {
    "id": "poker-odds",
    "type": "com.clodhub/poker-odds",
    "version": "1.0.0"
   }
  ],
  "requires": [
   {
    "id": "hand-ranking",
    "type": "com.clodhub/hand-ranking",
    "version": "1.0.0"
   },
   {
    "id": "card-deck",
    "type": "com.clodhub/card-deck",
    "version": "1.0.0"
   }
  ],
  "profiles": [
   {
    "id": "any",
    "settings": {}
   }
  ]
 },
 {
  "name": "pkg:clod/com.clodhub/poker-strategy",
  "version": "0.3.0",
  "category": "poker",
  "targets": {
   "client": [],
   "server": []
  },
  "provides": [
   {
    "id": "player-strategy",
    "type": "com.clodhub/player-strategy",
    "version": "1.0.0"
   }
  ],
  "requires": [
   {
    "id": "hand-ranking",
    "type": "com.clodhub/hand-ranking",
    "version": "1.0.0"
   },
   {
    "id": "poker-odds",
    "type": "com.clodhub/poker-odds",
    "version": "1.0.0"
   }
  ],
  "profiles": [
   {
    "id": "any",
    "settings": {}
   }
  ]
 },
 {
  "name": "pkg:clod/com.clodhub/preferences",
  "version": "0.1.1",
  "category": "rooms",
  "targets": {
   "client": [
    "android",
    "ios",
    "macos",
    "tvos",
    "web"
   ],
   "server": []
  },
  "provides": [
   {
    "id": "preferences",
    "type": "com.clodhub/preferences",
    "version": "1.0.0"
   }
  ],
  "requires": [],
  "profiles": [
   {
    "id": "any",
    "settings": {}
   }
  ]
 },
 {
  "name": "pkg:clod/com.clodhub/presence",
  "version": "0.3.0",
  "category": "rooms",
  "targets": {
   "client": [],
   "server": []
  },
  "provides": [
   {
    "id": "presence",
    "type": "com.clodhub/presence",
    "version": "1.0.0"
   }
  ],
  "requires": [
   {
    "id": "guest-identity",
    "type": "com.clodhub/guest-identity",
    "version": "1.0.0"
   }
  ],
  "profiles": [
   {
    "id": "any",
    "settings": {}
   }
  ]
 },
 {
  "name": "pkg:clod/com.clodhub/private-views",
  "version": "0.3.0",
  "category": "rooms",
  "targets": {
   "client": [
    "android",
    "ios",
    "macos",
    "tvos",
    "web"
   ],
   "server": []
  },
  "provides": [
   {
    "id": "private-views",
    "type": "com.clodhub/private-views",
    "version": "1.0.0"
   }
  ],
  "requires": [],
  "profiles": [
   {
    "id": "any",
    "settings": {}
   }
  ]
 },
 {
  "name": "pkg:clod/com.clodhub/realtime-rooms",
  "version": "0.5.0",
  "category": "rooms",
  "targets": {
   "client": [
    "android",
    "ios",
    "macos",
    "tvos",
    "web"
   ],
   "server": [
    "hosting-provider",
    "own-hardware"
   ]
  },
  "provides": [
   {
    "id": "room-session",
    "type": "com.clodhub/room-session",
    "version": "1.0.0"
   }
  ],
  "requires": [
   {
    "id": "game-adapter",
    "type": "com.clodhub/game-adapter",
    "version": "1.0.0"
   },
   {
    "id": "guest-identity",
    "type": "com.clodhub/guest-identity",
    "version": "1.0.0"
   }
  ],
  "profiles": [
   {
    "id": "free",
    "settings": {}
   },
   {
    "id": "paid",
    "settings": {}
   },
   {
    "id": "own-hardware",
    "settings": {}
   }
  ]
 },
 {
  "name": "pkg:clod/com.clodhub/room-directory",
  "version": "0.3.0",
  "category": "rooms",
  "targets": {
   "client": [
    "android",
    "ios",
    "macos",
    "tvos",
    "web"
   ],
   "server": [
    "hosting-provider",
    "own-hardware"
   ]
  },
  "provides": [
   {
    "id": "room-directory",
    "type": "com.clodhub/room-directory",
    "version": "1.0.0"
   }
  ],
  "requires": [
   {
    "id": "room-session",
    "type": "com.clodhub/room-session",
    "version": "1.0.0"
   }
  ],
  "profiles": [
   {
    "id": "any",
    "settings": {}
   }
  ]
 },
 {
  "name": "pkg:clod/com.clodhub/round-history",
  "version": "0.3.0",
  "category": "game-framework",
  "targets": {
   "client": [
    "android",
    "ios",
    "macos",
    "tvos"
   ],
   "server": []
  },
  "provides": [
   {
    "id": "round-history",
    "type": "com.clodhub/round-history",
    "version": "1.0.0"
   }
  ],
  "requires": [],
  "profiles": [
   {
    "id": "any",
    "settings": {}
   }
  ]
 },
 {
  "name": "pkg:clod/com.clodhub/rules-settings",
  "version": "0.3.0",
  "category": "game-framework",
  "targets": {
   "client": [
    "web"
   ],
   "server": []
  },
  "provides": [
   {
    "id": "rules-settings",
    "type": "com.clodhub/rules-settings",
    "version": "1.0.0"
   }
  ],
  "requires": [],
  "profiles": [
   {
    "id": "any",
    "settings": {}
   }
  ]
 },
 {
  "name": "pkg:clod/com.clodhub/seating",
  "version": "0.3.0",
  "category": "game-framework",
  "targets": {
   "client": [
    "android",
    "ios",
    "macos",
    "tvos",
    "web"
   ],
   "server": []
  },
  "provides": [
   {
    "id": "seating",
    "type": "com.clodhub/seating",
    "version": "1.0.0"
   }
  ],
  "requires": [
   {
    "id": "guest-identity",
    "type": "com.clodhub/guest-identity",
    "version": "1.0.0"
   }
  ],
  "profiles": [
   {
    "id": "any",
    "settings": {}
   }
  ]
 },
 {
  "name": "pkg:clod/com.clodhub/server-host",
  "version": "0.4.0",
  "category": "delivery",
  "targets": {
   "client": [],
   "server": [
    "hosting-provider",
    "own-hardware"
   ]
  },
  "provides": [
   {
    "id": "server-host",
    "type": "com.clodhub/server-host",
    "version": "1.0.0"
   }
  ],
  "requires": [
   {
    "id": "room-session",
    "type": "com.clodhub/room-session",
    "version": "1.0.0"
   },
   {
    "id": "room-directory",
    "type": "com.clodhub/room-directory",
    "version": "1.0.0"
   }
  ],
  "profiles": [
   {
    "id": "cloudflare-free",
    "settings": {}
   },
   {
    "id": "cloudflare-paid",
    "settings": {}
   },
   {
    "id": "own-hardware",
    "settings": {}
   }
  ]
 },
 {
  "name": "pkg:clod/com.clodhub/sound-cues",
  "version": "0.3.0",
  "category": "presentation",
  "targets": {
   "client": [
    "android",
    "ios",
    "macos",
    "tvos",
    "web"
   ],
   "server": []
  },
  "provides": [
   {
    "id": "sound-cues",
    "type": "com.clodhub/sound-cues",
    "version": "1.0.0"
   }
  ],
  "requires": [
   {
    "id": "preferences",
    "type": "com.clodhub/preferences",
    "version": "1.0.0"
   }
  ],
  "profiles": [
   {
    "id": "any",
    "settings": {}
   }
  ]
 },
 {
  "name": "pkg:clod/com.clodhub/store-update",
  "version": "0.4.0",
  "category": "delivery",
  "targets": {
   "client": [
    "android",
    "ios",
    "macos",
    "tvos",
    "web"
   ],
   "server": []
  },
  "provides": [
   {
    "id": "updates",
    "type": "com.clodhub/updates",
    "version": "1.0.0"
   }
  ],
  "requires": [],
  "profiles": [
   {
    "id": "any",
    "settings": {}
   }
  ]
 },
 {
  "name": "pkg:clod/com.clodhub/table-layout",
  "version": "0.3.0",
  "category": "presentation",
  "targets": {
   "client": [
    "android",
    "ios",
    "macos",
    "tvos",
    "web"
   ],
   "server": []
  },
  "provides": [
   {
    "id": "table-layout",
    "type": "com.clodhub/table-layout",
    "version": "1.0.0"
   }
  ],
  "requires": [
   {
    "id": "theme",
    "type": "com.clodhub/theme",
    "version": "1.0.0"
   },
   {
    "id": "controls",
    "type": "com.clodhub/controls",
    "version": "1.0.0"
   }
  ],
  "profiles": [
   {
    "id": "any",
    "settings": {}
   }
  ]
 },
 {
  "name": "pkg:clod/com.clodhub/theme",
  "version": "0.3.0",
  "category": "presentation",
  "targets": {
   "client": [
    "android",
    "ios",
    "macos",
    "tvos",
    "web"
   ],
   "server": []
  },
  "provides": [
   {
    "id": "theme",
    "type": "com.clodhub/theme",
    "version": "1.0.0"
   }
  ],
  "requires": [],
  "profiles": [
   {
    "id": "any",
    "settings": {}
   }
  ]
 },
 {
  "name": "pkg:clod/com.clodhub/tournament",
  "version": "0.3.0",
  "category": "game-framework",
  "targets": {
   "client": [
    "android",
    "ios",
    "macos",
    "tvos",
    "web"
   ],
   "server": []
  },
  "provides": [
   {
    "id": "tournament",
    "type": "com.clodhub/tournament",
    "version": "1.0.0"
   }
  ],
  "requires": [
   {
    "id": "chip-ledger",
    "type": "com.clodhub/chip-ledger",
    "version": "1.0.0"
   },
   {
    "id": "level-schedule",
    "type": "com.clodhub/level-schedule",
    "version": "1.0.0"
   },
   {
    "id": "seating",
    "type": "com.clodhub/seating",
    "version": "1.0.0"
   }
  ],
  "profiles": [
   {
    "id": "any",
    "settings": {}
   }
  ]
 },
 {
  "name": "pkg:clod/com.clodhub/translations",
  "version": "0.4.0",
  "category": "presentation",
  "targets": {
   "client": [
    "android",
    "ios",
    "macos",
    "tvos",
    "web"
   ],
   "server": []
  },
  "provides": [
   {
    "id": "language",
    "type": "com.clodhub/language",
    "version": "1.0.0"
   }
  ],
  "requires": [],
  "profiles": [
   {
    "id": "any",
    "settings": {}
   }
  ]
 },
 {
  "name": "pkg:clod/com.clodhub/turn-engine",
  "version": "0.4.0",
  "category": "game-framework",
  "targets": {
   "client": [],
   "server": []
  },
  "provides": [
   {
    "id": "game-adapter",
    "type": "com.clodhub/game-adapter",
    "version": "1.0.0"
   }
  ],
  "requires": [
   {
    "id": "game-rules",
    "type": "com.clodhub/game-rules",
    "version": "1.0.0"
   },
   {
    "id": "seating",
    "type": "com.clodhub/seating",
    "version": "1.0.0"
   },
   {
    "id": "game-clock",
    "type": "com.clodhub/game-clock",
    "version": "1.0.0"
   },
   {
    "id": "private-views",
    "type": "com.clodhub/private-views",
    "version": "1.0.0"
   },
   {
    "id": "presence",
    "type": "com.clodhub/presence",
    "version": "1.0.0"
   },
   {
    "id": "tournament",
    "type": "com.clodhub/tournament",
    "version": "1.0.0"
   },
   {
    "id": "computer-players",
    "type": "com.clodhub/computer-players",
    "version": "1.0.0",
    "optional": true
   },
   {
    "id": "round-history",
    "type": "com.clodhub/round-history",
    "version": "1.0.0"
   },
   {
    "id": "rules-settings",
    "type": "com.clodhub/rules-settings",
    "version": "1.0.0"
   }
  ],
  "profiles": [
   {
    "id": "any",
    "settings": {}
   }
  ]
 },
 {
  "name": "pkg:clod/com.clodhub/video-calls",
  "version": "0.4.0",
  "category": "rooms",
  "targets": {
   "client": [
    "android",
    "ios",
    "macos",
    "tvos",
    "web"
   ],
   "server": []
  },
  "provides": [
   {
    "id": "media-session",
    "type": "com.clodhub/media-session",
    "version": "1.0.0"
   }
  ],
  "requires": [
   {
    "id": "video-calls-configuration",
    "type": "com.clodhub/video-calls-configuration",
    "version": "1.0.0",
    "optional": true
   }
  ],
  "profiles": [
   {
    "id": "free",
    "settings": {}
   },
   {
    "id": "paid",
    "settings": {}
   },
   {
    "id": "scale",
    "settings": {}
   }
  ]
 },
 {
  "name": "pkg:clod/com.clodhub/web-host",
  "version": "0.3.0",
  "category": "delivery",
  "targets": {
   "client": [
    "web"
   ],
   "server": []
  },
  "provides": [
   {
    "id": "web-shell",
    "type": "com.clodhub/web-shell",
    "version": "1.0.0"
   }
  ],
  "requires": [
   {
    "id": "theme",
    "type": "com.clodhub/theme",
    "version": "1.0.0"
   }
  ],
  "profiles": [
   {
    "id": "any",
    "settings": {}
   }
  ]
 },
 {
  "name": "pkg:clod/com.clodhub/windows-desktop",
  "version": "0.4.0",
  "category": "delivery",
  "targets": {
   "client": [
    "windows"
   ],
   "server": []
  },
  "provides": [
   {
    "id": "desktop-host",
    "type": "com.clodhub/desktop-host",
    "version": "1.0.0"
   }
  ],
  "requires": [
   {
    "id": "windows-desktop-configuration",
    "type": "com.clodhub/windows-desktop-configuration",
    "version": "1.0.0",
    "optional": true
   }
  ],
  "profiles": [
   {
    "id": "any",
    "settings": {}
   }
  ]
 }
];
