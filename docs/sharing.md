# Public viewing and simulation

## Review of the previous flow

The public presentation link bypassed authentication but disabled simulation. Copying its link also changed link access to view-only, unexpectedly removing editing by link. A separate editing-link button appeared regardless of the selected permission. The clipboard action and access policy were coupled, and the labels did not describe the visitor's actual capabilities.

## Updated behavior

The sharing panel follows familiar document-sharing conventions: people with access, general access, an explicit permission selector, and one copy action. Copying never changes permissions. An invitation preview opens the anonymous viewer without inheriting the owner's credentials. Viewing links use `?p=<id>&view=1`; editing links retain the normal project URL.

Restricted projects remain inaccessible to anonymous visitors. Both public modes allow anonymous viewing and simulation; editing requires authentication and the existing editor/owner permission. Existing project access settings are preserved.

Public visitors can start and stop simulation, press buttons, operate switches, and use the simulated display. Persistent switch properties are overlaid in memory for viewers and cleared when stopping simulation; they never modify Yjs. Viewer IndexedDB documents and measurement preferences use a separate namespace from the editor. The WebSocket server continues to reject all viewer document writes.

Anonymous compilation requires a project and board identifier. The server verifies public access and checks the source and board target against the current shared Yjs document, including pending Redis updates, before serving even cached results. Unpublished or modified code is rejected. Cache misses are rate limited per project. Guests do not start a programless simulation when the compiler is unavailable.

The interface remains in Spanish to match the product. Native permission selectors provide keyboard access, permission descriptions explain account requirements, and clipboard failure leaves a selectable URL.

The design applies Jakob's law through established sharing controls and separation of permissions from clipboard actions: https://www.nngroup.com/articles/consistency-and-standards/
