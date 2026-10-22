"""The separate, pictures-only publisher: add or change article pictures, copy the photo prompts, and publish the pictures.
It has no article form. It uses its own folder and its own ports, so it can run beside the article publisher."""
import publish

publish.PORT, publish.PREVIEW_PORT = 8775, 8776
publish.PHOTOS_ONLY = True

if __name__ == "__main__":
    publish.main()
