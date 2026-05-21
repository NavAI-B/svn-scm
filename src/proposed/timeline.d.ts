/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Type declarations for vscode.proposed.timeline
// https://github.com/microsoft/vscode/issues/106887

declare module "vscode" {
  export class TimelineItem {
    /**
     * A human-readable string describing the timeline item.
     */
    label: string;

    /**
     * Optional id for the timeline item.
     */
    id?: string;

    /**
     * The icon path or ThemeIcon for the timeline item.
     */
    iconPath?: Uri | { light: Uri; dark: Uri } | ThemeIcon;

    /**
     * A human readable string describing less prominent details of the
     * timeline item.
     */
    description?: string;

    /**
     * The tooltip text of the timeline item.
     */
    tooltip?: string | MarkdownString;

    /**
     * The command that should be executed when the timeline item is clicked.
     */
    command?: Command;

    /**
     * Context value of the timeline item. This can be used to contribute
     * specific actions to the item.
     */
    contextValue?: string;

    /**
     * Accessibility information used when a screen reader interacts with this
     * timeline item.
     */
    accessibilityInformation?: AccessibilityInformation;

    /**
     * The timestamp of the timeline item.
     */
    timestamp: number;

    /**
     * @param label A human-readable string describing the timeline item.
     * @param timestamp The timestamp of the timeline item.
     */
    constructor(label: string, timestamp: number);
  }

  export interface Timeline {
    /**
     * An optional cursor for the last item in the list.
     * If not provided, the timeline is assumed to be complete.
     */
    readonly paging?: {
      readonly cursor: string | undefined;
    };

    /**
     * The items in the timeline.
     */
    readonly items: readonly TimelineItem[];
  }

  export interface TimelineOptions {
    /**
     * A cursor used to page results.
     */
    readonly cursor?: string;

    /**
     * An optional maximum number of items to return.
     */
    readonly limit?: number | { timestamp: number; id?: string };
  }

  export interface TimelineChangeEvent {
    /**
     * The {@link Uri} of the resource that changed, or `undefined` if
     * the change affects all resources.
     */
    readonly uri: Uri | undefined;

    /**
     * An optional flag to reset the timeline cursor.
     */
    readonly reset: boolean;
  }

  export interface TimelineProvider {
    /**
     * An identifier for the timeline provider.
     */
    readonly id: string;

    /**
     * A human-readable name for the timeline provider.
     */
    readonly label: string;

    /**
     * An optional event to signal that the timeline has changed.
     */
    onDidChange?: Event<TimelineChangeEvent | undefined>;

    /**
     * Provide timeline items for a given {@link Uri}.
     *
     * @param uri The {@link Uri} of the file to provide the timeline for.
     * @param options Options for the timeline request.
     * @param token A cancellation token.
     */
    provideTimeline(
      uri: Uri,
      options: TimelineOptions,
      token: CancellationToken
    ): ProviderResult<Timeline>;
  }

  export namespace workspace {
    /**
     * Registers a timeline provider for the given scheme.
     *
     * @param scheme The URI scheme(s) the provider handles.
     * @param provider The timeline provider.
     * @returns A disposable that unregisters the provider.
     */
    export function registerTimelineProvider(
      scheme: string | string[],
      provider: TimelineProvider
    ): Disposable;
  }
}
