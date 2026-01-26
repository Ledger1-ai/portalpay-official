
import React from "react";
import { Book, Globe, Download, Calendar, Ruler, Users, Layers, Tag, Bookmark } from "lucide-react";
import type { PublishingItemAttributes } from "@/types/inventory";

interface PublishingDetailsProps {
    attributes: PublishingItemAttributes;
    primaryColor?: string;
}

export function PublishingDetails({ attributes, primaryColor }: PublishingDetailsProps) {
    if (!attributes) return null;

    const {
        author, publisher, isbn, publicationDate, format,
        pageCount, language, edition, genre, condition,
        downloadUrl, previewUrl, drmEnabled
    } = attributes;

    const colorStyle = { color: primaryColor };
    const bgStyle = { backgroundColor: `${primaryColor}15`, color: primaryColor, borderColor: `${primaryColor}30` };

    return (
        <div className="space-y-4">
            {/* Main Metadata */}
            <div className="grid grid-cols-2 gap-3 text-sm">
                {author && (
                    <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">{author}</span>
                    </div>
                )}
                {publisher && (
                    <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-muted-foreground" />
                        <span className="text-muted-foreground">{publisher}</span>
                    </div>
                )}
                {publicationDate && (
                    <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span className="text-muted-foreground">{new Date(publicationDate).toLocaleDateString()}</span>
                    </div>
                )}
                {isbn && (
                    <div className="flex items-center gap-2">
                        <Tag className="w-4 h-4 text-muted-foreground" />
                        <span className="font-mono text-xs">{isbn}</span>
                    </div>
                )}
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-2">
                {format && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium bg-background">
                        <Book className="w-3.5 h-3.5 opacity-70" />
                        {format}
                    </span>
                )}
                {(pageCount || 0) > 0 && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium bg-background">
                        <Ruler className="w-3.5 h-3.5 opacity-70" />
                        {pageCount} pages
                    </span>
                )}
                {language && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium bg-background">
                        <Globe className="w-3.5 h-3.5 opacity-70" />
                        {language}
                    </span>
                )}
                {edition && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium bg-background">
                        <Layers className="w-3.5 h-3.5 opacity-70" />
                        {edition}
                    </span>
                )}
                {condition && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium bg-background">
                        <Bookmark className="w-3.5 h-3.5 opacity-70" />
                        {condition}
                    </span>
                )}
            </div>

            {/* Genres */}
            {Array.isArray(genre) && genre.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {genre.map((g, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-full text-[10px] font-medium border bg-muted/50 text-muted-foreground">
                            {g}
                        </span>
                    ))}
                </div>
            )}

            {/* DRM / Rights */}
            {drmEnabled && (
                <div className="text-xs text-amber-600 flex items-center gap-1.5 bg-amber-500/10 px-3 py-2 rounded-md border border-amber-500/20">
                    <span className="font-bold">DRM Protected</span>
                    <span>•</span>
                    <span>Content rights are managed via smart contract.</span>
                </div>
            )}

            {/* Actions */}
            {(downloadUrl || previewUrl) && (
                <div className="flex gap-2 pt-2">
                    {previewUrl && (
                        <a
                            href={previewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 flex items-center justify-center gap-2 h-9 px-3 rounded-md text-sm font-medium border hover:bg-muted/50 transition-colors"
                        >
                            <Book className="w-4 h-4" />
                            Read Preview
                        </a>
                    )}
                    {downloadUrl && (
                        <a
                            href={downloadUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 flex items-center justify-center gap-2 h-9 px-3 rounded-md text-sm font-medium border hover:bg-muted/50 transition-colors"
                        >
                            <Download className="w-4 h-4" />
                            Download
                        </a>
                    )}
                </div>
            )}
        </div>
    );
}
