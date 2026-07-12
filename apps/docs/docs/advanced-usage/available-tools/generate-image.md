---
sidebar_position: 14
title: generate_image
---

# `generate_image` — Mirror VS, the Artist

Ever wanted Mirror VS to moonlight as a graphic designer? [`generate_image`](generate-image.md) lets it generate images directly from text descriptions — or edit existing images — using AI image generation models.

## Parameters

| Parameter         | Type              | Required | Description                                           |
| ----------------- | ----------------- | -------- | ----------------------------------------------------- |
| `prompt`          | `string`          | ✅       | Text description of the image to generate             |
| `size`            | `string`          | ❌       | Image dimensions (e.g., `"1024x1024"`, `"1792x1024"`) |
| `model`           | `string`          | ❌       | Specific image model to use                           |
| `negative_prompt` | `string`          | ❌       | Things to avoid in the generated image                |
| `image`           | `string` (base64) | ❌       | Starting image for image-to-image editing             |

## What It Does

[`generate_image`](generate-image.md) sends a text prompt (and optionally, a starting image) to an image generation model via OpenRouter or the Mirror provider, and returns the generated image. It's text-to-image and image-to-image, wrapped in a tool call.

## When Is It Used?

When you need visual content created as part of your workflow — for example:

- Generating placeholder images for a UI mockup
- Creating diagrams or illustrations for documentation
- Modifying existing images with AI-powered editing
- Rapid prototyping of visual concepts

## Key Features

- **Text-to-image generation** — Describe what you want, and the AI makes it
- **Image-to-image editing** — Provide a starting image with a prompt describing the changes
- **Multiple providers** — Works with OpenRouter and the built-in Mirror provider
- **Configurable output size** — Control the dimensions of generated images

## Limitations

- **Experimental feature** — Must be explicitly enabled in settings
- **Not available with all providers** — Requires a provider that supports image generation
- **Cost varies** — Image generation tokens are priced differently than text
- **Quality depends on model** — Different image models produce different results

## How It Works

1. The AI crafts a text prompt describing the image to generate
2. Mirror VS sends the request to the configured image generation provider
3. The provider generates the image (takes a few seconds)
4. The resulting image is returned and can be saved to the workspace
5. You approve the save location and the image is written to disk

## Usage Examples

### Text-to-Image

```
Generate a diagram showing how JWT authentication works, styled like a whiteboard sketch
```

This triggers [`generate_image`](generate-image.md) with your prompt, and the result is an image ready to drop into your docs.

### Image-to-Image Editing

```
Change the color scheme of this logo from blue to green
[attached: logo.png]
```

Provide a starting image and a description of the changes you want.

## Configuration

To use [`generate_image`](generate-image.md), you need to:

1. Enable the "Image Generation" experimental feature in settings
2. Configure an image-capable provider (OpenRouter or Mirror provider)
3. Set your preferred default image model and size

## Relation to Features

[`generate_image`](generate-image.md) pairs naturally with [`read_file`](read-file.md) (for reading existing images) and the documentation workflow. It's part of Mirror VS's broader capabilities around content creation and visual communication.
