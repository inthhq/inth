export const revalidate = 60;

const ISRPage = () => (
	<p>
		Client init on an ISR route (revalidate 60s). Built at{' '}
		{/* oxlint-disable-next-line react/purity -- Server Component intentionally renders ISR build timestamp. */}
		{new Date().toISOString()}.
	</p>
);

export default ISRPage;
