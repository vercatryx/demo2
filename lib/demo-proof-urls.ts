/** Demo delivery proof photos (Amazon-style) for seed + one-off DB patches. */
export const DEMO_PROOF_URLS = [
    'https://assets.aboutamazon.com/dims4/default/0aae044/2147483647/strip/true/crop/1600x900+0+0/resize/1320x743!/quality/90/?url=https%3A%2F%2Famazon-blogs-brightspot.s3.amazonaws.com%2F24%2Fc6%2F8c22481c49609a49c220b1df2c59%2Finline2.jpg',
    'https://c8.alamy.com/comp/M7K6YW/amazon-prime-boxes-delivered-and-stacked-at-the-front-door-of-a-residential-M7K6YW.jpg',
] as const;

export function demoProofUrl(index: number): string {
    return DEMO_PROOF_URLS[index % DEMO_PROOF_URLS.length]!;
}
