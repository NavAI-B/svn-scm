/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

"use strict";

import {
  Disposable,
  Event,
  EventEmitter,
  FileDecoration,
  FileDecorationProvider,
  Uri,
  window
} from "vscode";
import { dispose } from "./util";
import { Resource } from "./resource";
import { ISvnResourceGroup } from "./common/types";

class SvnDecorationProvider implements FileDecorationProvider {
  private readonly _onDidChangeDecorations = new EventEmitter<Uri[]>();
  readonly onDidChangeFileDecorations: Event<Uri[]> =
    this._onDidChangeDecorations.event;

  private disposables: Disposable[] = [];
  private decorations = new Map<string, FileDecoration>();

  constructor() {
    this.disposables.push(window.registerFileDecorationProvider(this));
  }

  updateDecorations(groups: ISvnResourceGroup[]): void {
    const newDecorations = new Map<string, FileDecoration>();

    for (const group of groups) {
      for (const r of group.resourceStates) {
        if (r instanceof Resource) {
          const decoration = r.resourceDecoration;
          if (decoration) {
            newDecorations.set(r.resourceUri.toString(), decoration);
          }
        }
      }
    }

    const uris = new Set(
      [...this.decorations.keys()].concat([...newDecorations.keys()])
    );
    this.decorations = newDecorations;
    this._onDidChangeDecorations.fire(
      [...uris.values()].map(value => Uri.parse(value, true))
    );
  }

  provideFileDecoration(uri: Uri): FileDecoration | undefined {
    return this.decorations.get(uri.toString());
  }

  dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.decorations.clear();
  }
}

export class SvnDecorations {
  private disposables: Disposable[] = [];
  private provider: SvnDecorationProvider | undefined;

  constructor(
    private getGroups: () => ISvnResourceGroup[],
    private onDidStatusChange: Event<void>
  ) {
    this.enable();
  }

  private enable(): void {
    this.provider = new SvnDecorationProvider();
    this.disposables.push(this.provider);

    this.disposables.push(
      this.onDidStatusChange(() => this.onDidChangeStatus())
    );
  }

  private onDidChangeStatus(): void {
    if (this.provider) {
      this.provider.updateDecorations(this.getGroups());
    }
  }

  dispose(): void {
    this.disposables = dispose(this.disposables);
  }
}
