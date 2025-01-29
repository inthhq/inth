import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { docsOptions } from "~/app/layout.config";
import { Header } from "~/components/header";
import { source } from "~/lib/source";

export default function NotFound() {
	return (
		<DocsLayout tree={source.pageTree} {...docsOptions}>
			<div className="relative w-full bg-background md:mt-4 md:overflow-clip md:rounded-tl-2xl md:border-t md:border-l">
				<Header />
				<div className="relative z-10 flex flex-col items-center justify-center h-screen space-y-4">
					<h2 className="text-2xl font-bold">Page Not Found</h2>
					<p className="text-sm text-muted-foreground">
						Sorry, the page you are looking for does not exist.
					</p>
				</div>
			</div>
		</DocsLayout>
	);
}
