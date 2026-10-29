// Brand marks of the engines and cloud providers the provider cards name (ui-kit, operator finding
// 2026-10-29: "replace the two-letter badges with each provider's and engine's official logo").
//
// Every mark is INLINED (no request to any host) and carries, next to its drawing, where it comes
// from, its licence or terms, and the date it was taken. The rules, in order:
//   1. the brand's own press/brand-kit SVG when its terms allow using it to identify the product;
//   2. else the Simple Icons project's SVG (CC0 path data; trademarks stay with their owners);
//   3. else a readable TEXT badge, with the reason (a brand that forbids use, or no logo exists).
// Marks are drawn in their OWN colours on a light tile (several brands forbid recolouring), never
// recoloured to the theme. Geometry is the source file's, unchanged; only editor metadata, titles and
// class-based styles were dropped (a class became its `fill`) and ids namespaced (`af-brand-<id>-…`).
// scripts/check_brand_icons.mjs: every id in BRAND_CARD_IDS has a mark or a documented fallback, each
// mark has its source, licence and date, and no mark references anything outside itself.
//
// Trademarks: every mark belongs to its owner; it identifies the product a card configures and
// implies no endorsement. MIT/CC0 cover the files' copyright, not the marks.

import React from "react";

export type BrandIcon = {
  id: string;
  name: string;
  /** "brand": the brand's own file; "simple-icons": the Simple Icons project's. */
  origin: "brand" | "simple-icons";
  /** The exact SVG file this drawing comes from. */
  source: string;
  /** The page with the brand's terms or the file's licence, as read. */
  terms: string;
  licence: string;
  /** What the terms restrict (and how this use stays within them). */
  restrictions: string;
  /** When the file and the terms were read (ISO date). */
  retrieved: string;
  viewBox: string;
  /** Inner SVG markup, in the brand's own colours. */
  body: string;
};

export type BrandFallback = {
  id: string;
  name: string;
  /** The readable badge shown instead of a logo. */
  text: string;
  terms: string;
  /** Why there is no logo. */
  reason: string;
  retrieved: string;
};

export const BRAND_ICONS: Readonly<Record<string, BrandIcon>> = {
  ollama: {
    id: "ollama",
    name: "Ollama",
    origin: "brand",
    source: "https://raw.githubusercontent.com/ollama/ollama/main/docs/ollama-logo.svg",
    terms: "https://ollama.com/terms",
    licence: "File is in the MIT-licensed ollama/ollama repo (Copyright (c) Ollama); MIT covers copyright only. Trademark of Ollama.",
    restrictions: "Ollama ToS: \"These Terms do not grant you any rights to use our branding without permission.\" No published brand guidelines; no recolour rule.",
    retrieved: "2026-10-29",
    viewBox: "0 0 17 25",
    body: "<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M4.40517 0.102088C4.62117 0.198678 4.81617 0.357766 4.99317 0.56799C5.28817 0.915712 5.53718 1.41342 5.72718 2.00318C5.91818 2.59635 6.04218 3.25316 6.08918 3.91224C6.71878 3.5075 7.41754 3.26103 8.13818 3.18953L8.18918 3.18498C9.05919 3.10544 9.91919 3.28384 10.6692 3.72361C10.7702 3.78384 10.8692 3.84861 10.9662 3.91679C11.0162 3.27021 11.1382 2.62817 11.3262 2.04863C11.5162 1.45773 11.7652 0.961166 12.0592 0.612308C12.2235 0.410338 12.4245 0.251368 12.6482 0.146406C12.9052 0.032771 13.1782 0.0123167 13.4442 0.098679C13.8452 0.228223 14.1892 0.516855 14.4602 0.936167C14.7082 1.3191 14.8942 1.81 15.0212 2.39863C15.2512 3.45998 15.2912 4.85655 15.1362 6.54061L15.1892 6.58607L15.2152 6.60766C15.9722 7.26219 16.4992 8.19513 16.7782 9.27807C17.2133 10.9678 16.9943 12.8632 16.2442 13.9235L16.2262 13.9473L16.2282 13.9507C16.6453 14.8166 16.8983 15.7314 16.9523 16.678L16.9543 16.7121C17.0183 17.9223 16.7542 19.1404 16.1402 20.337L16.1332 20.3484L16.1432 20.3756C16.6152 21.6904 16.7632 23.0142 16.5812 24.3369L16.5752 24.3813C16.547 24.5744 16.4525 24.7472 16.3125 24.8612C16.1725 24.9753 15.9983 25.0219 15.8282 24.9903C15.744 24.9753 15.6632 24.9417 15.5904 24.8912C15.5177 24.8408 15.4544 24.7744 15.4042 24.696C15.3541 24.6178 15.318 24.529 15.2981 24.4347C15.2782 24.3406 15.2748 24.2428 15.2882 24.1472C15.4552 22.9733 15.2982 21.7961 14.8082 20.5984C14.7625 20.4871 14.7422 20.3645 14.7492 20.242C14.7562 20.1194 14.7902 20.0009 14.8482 19.8972L14.8522 19.8904C15.4562 18.8404 15.7062 17.8109 15.6522 16.7996C15.6062 15.9143 15.3272 15.045 14.8522 14.2166C14.7598 14.0556 14.7269 13.8597 14.7606 13.6713C14.7943 13.4829 14.8918 13.3171 15.0322 13.2098L15.0412 13.203C15.2842 13.0223 15.5082 12.561 15.6212 11.9303C15.7459 11.1846 15.7133 10.4159 15.5262 9.68716C15.3212 8.89171 14.9462 8.22809 14.4212 7.77468C13.8262 7.25878 13.0382 7.00992 12.0412 7.08151C11.9108 7.09115 11.7809 7.05613 11.6682 6.98097C11.5556 6.90581 11.4653 6.79399 11.4092 6.65993C11.0952 5.90426 10.6372 5.36336 10.0662 5.02814C9.51799 4.71723 8.90425 4.58657 8.29418 4.65087C7.04918 4.76337 5.95118 5.56108 5.62418 6.56675C5.57792 6.70829 5.4947 6.8304 5.38568 6.91672C5.27666 7.00301 5.14703 7.04942 5.01417 7.0497C3.94717 7.05197 3.12117 7.33606 2.51717 7.84855C1.99517 8.29172 1.63916 8.91103 1.45116 9.65307C1.28104 10.3515 1.25774 11.0857 1.38316 11.7962C1.49516 12.4303 1.71416 12.9553 1.96517 13.2382L1.97317 13.2462C2.18517 13.4814 2.23017 13.8485 2.08217 14.1382C1.72216 14.845 1.45316 15.8984 1.40916 16.9109C1.35916 18.0677 1.59516 19.0722 2.12817 19.7927L2.14417 19.8143C2.22461 19.9208 2.27633 20.0514 2.29319 20.1905C2.31003 20.3295 2.29127 20.4711 2.23917 20.5984C1.66316 22.0029 1.48616 23.1574 1.67716 24.0665C1.71148 24.2556 1.67954 24.4524 1.58812 24.6149C1.4967 24.7776 1.35302 24.8933 1.18766 24.9374C1.0223 24.9817 0.848322 24.9506 0.702741 24.8512C0.557141 24.7517 0.451463 24.5917 0.408163 24.4051C0.165162 23.2483 0.330162 21.9233 0.881162 20.4302L0.895162 20.3904L0.887162 20.3768C0.616341 19.9222 0.414243 19.4195 0.289162 18.8893L0.284162 18.8677C0.132362 18.2062 0.0726416 17.5218 0.107162 16.8393C0.151162 15.8052 0.385163 14.7462 0.729162 13.8962L0.741162 13.8666L0.739162 13.8644C0.446163 13.3894 0.229162 12.7814 0.109162 12.1087L0.104162 12.0814C-0.0611788 11.1431 -0.0293187 10.1737 0.197162 9.25194C0.459163 8.21218 0.974162 7.31901 1.73316 6.67356C1.79316 6.62243 1.85616 6.57129 1.91916 6.52357C1.76016 4.827 1.80016 3.42134 2.03117 2.35317C2.15817 1.76455 2.34517 1.27365 2.59317 0.890713C2.86317 0.472537 3.20717 0.183905 3.60817 0.0532252C3.87417 -0.0331371 4.14817 -0.0126829 4.40517 0.102088ZM8.52118 10.4315C9.45719 10.4315 10.3212 10.7871 10.9672 11.403C11.5972 12.0019 11.9722 12.8064 11.9722 13.6076C11.9722 14.6166 11.5662 15.403 10.8392 15.9052C10.2192 16.3314 9.38819 16.5382 8.43618 16.5382C7.42718 16.5382 6.56518 16.2439 5.94318 15.7041C5.32618 15.17 4.98017 14.42 4.98017 13.6076C4.98017 12.8042 5.37818 11.9973 6.03618 11.3962C6.70418 10.786 7.58618 10.4315 8.52118 10.4315ZM8.52118 11.4496C7.82742 11.4428 7.15204 11.7031 6.60518 12.1883C6.14418 12.6087 5.88318 13.1371 5.88318 13.6087C5.88318 14.095 6.09318 14.5507 6.49318 14.8973C6.94818 15.2916 7.61718 15.52 8.43618 15.52C9.23519 15.52 9.90919 15.353 10.3682 15.0359C10.8312 14.7178 11.0682 14.2564 11.0682 13.6076C11.0682 13.1269 10.8222 12.5962 10.3852 12.1803C9.90119 11.7201 9.24519 11.4496 8.52118 11.4496ZM9.18319 12.8246L9.18719 12.8292C9.30719 13.0007 9.28219 13.2496 9.13119 13.386L8.83919 13.6473V14.1541C8.83865 14.267 8.79877 14.375 8.72829 14.4544C8.6578 14.5339 8.56246 14.5783 8.46318 14.578C8.3639 14.5783 8.26856 14.5339 8.19808 14.4544C8.12758 14.375 8.0877 14.267 8.08718 14.1541V13.6314L7.81618 13.3837C7.78042 13.3511 7.7507 13.3109 7.72872 13.2652C7.70674 13.2195 7.69294 13.1694 7.6881 13.1176C7.68326 13.0658 7.6875 13.0135 7.70056 12.9636C7.71362 12.9137 7.73524 12.8672 7.76418 12.8269C7.8232 12.7452 7.9082 12.6934 8.0007 12.6825C8.09318 12.6717 8.18572 12.7027 8.25818 12.7689L8.47318 12.9644L8.69318 12.7667C8.76538 12.7018 8.85702 12.6716 8.94854 12.6825C9.04009 12.6933 9.12427 12.7443 9.18319 12.8246ZM4.14317 10.644C4.62117 10.644 5.01017 11.0871 5.01017 11.6337C5.01043 11.8957 4.91917 12.1471 4.75641 12.3327C4.59365 12.5183 4.37273 12.6229 4.14217 12.6235C3.91195 12.6226 3.69143 12.518 3.52893 12.3327C3.36641 12.1474 3.27517 11.8965 3.27517 11.6349C3.27463 11.3729 3.36565 11.1213 3.52821 10.9355C3.69079 10.7497 3.91261 10.6449 4.14317 10.644ZM12.8492 10.644C13.3292 10.644 13.7172 11.0871 13.7172 11.6337C13.7175 11.8957 13.6262 12.1471 13.4634 12.3327C13.3007 12.5183 13.0798 12.6229 12.8492 12.6235C12.619 12.6226 12.3985 12.518 12.236 12.3327C12.0734 12.1474 11.9822 11.8965 11.9822 11.6349C11.9817 11.3729 12.0727 11.1213 12.2352 10.9355C12.3978 10.7497 12.6186 10.6449 12.8492 10.644ZM3.94017 1.47705L3.93717 1.47932C3.82131 1.53657 3.72239 1.63046 3.65217 1.74977L3.64717 1.75659C3.50917 1.97136 3.38917 2.28727 3.29917 2.70203C3.12917 3.48839 3.08317 4.55541 3.17517 5.86335C3.60517 5.7179 4.07417 5.62699 4.57917 5.59404L4.58917 5.5929L4.60817 5.55426C4.65417 5.46108 4.70317 5.37131 4.75617 5.28268C4.87917 4.40655 4.77817 3.35998 4.50317 2.50545C4.36917 2.09182 4.20617 1.76682 4.05017 1.5816C4.01797 1.5431 3.98207 1.5088 3.94317 1.47932L3.94017 1.47705ZM13.1142 1.52251L13.1122 1.52364C13.0733 1.55312 13.0374 1.58741 13.0052 1.62591C12.8492 1.81114 12.6852 2.13727 12.5522 2.5509C12.2622 3.45316 12.1652 4.56905 12.3222 5.47358L12.3802 5.58381L12.3882 5.59972H12.4182C12.9145 5.59988 13.4082 5.68101 13.8842 5.84062C13.9702 4.56337 13.9222 3.51907 13.7562 2.74749C13.6662 2.33272 13.5462 2.01682 13.4072 1.80205L13.4032 1.79523C13.3331 1.67548 13.2342 1.58121 13.1182 1.52364L13.1142 1.52251Z\" fill=\"black\"/>",
  },
  lmstudio: {
    id: "lmstudio",
    name: "LM Studio",
    origin: "simple-icons",
    source: "https://cdn.jsdelivr.net/npm/simple-icons@16.35.0/icons/lmstudio.svg",
    terms: "https://lmstudio.ai/brand",
    licence: "CC0-1.0 (Simple Icons path data); icon contributed to Simple Icons by the LM Studio team (PRs simple-icons#14717, #14905); byte-identical to https://files.lmstudio.ai/lmstudio_icon2.svg. Trademark of Element Labs, Inc.",
    restrictions: "Brand page: \"Do not recolor the logo or create unapproved color combinations.\" and \"The permission we grant to you is non-exclusive and non-transferable.\" Identification is allowed: \"Use LM Studio logo when referring to LM Studio\". Simple Icons draws the path without a colour; it is filled with Simple Icons' recorded brand hex #000000 (black), the logo's own colour.",
    retrieved: "2026-10-29",
    viewBox: "0 0 24 24",
    body: "<g fill=\"#000000\"><path d=\"M14.025 0c3.492 0 5.237 0 6.571.68a6.24 6.24 0 0 1 2.725 2.724C24 4.738 24 6.484 24 9.975v4.05c0 3.492 0 5.237-.68 6.571a6.24 6.24 0 0 1-2.724 2.725c-1.334.679-3.08.679-6.571.679h-4.05c-3.492 0-5.237 0-6.571-.68A6.24 6.24 0 0 1 .68 20.597C0 19.262 0 17.516 0 14.025v-4.05c0-3.492 0-5.237.68-6.571A6.23 6.23 0 0 1 3.404.68C4.738 0 6.484 0 9.975 0zM7.688 16.313a1.313 1.313 0 0 0 0 2.625h11.625a1.313 1.313 0 0 0 0-2.625zm-3-3.75a1.313 1.313 0 0 0 0 2.624h11.625a1.313 1.313 0 0 0 0-2.624zm3-3.75a1.313 1.313 0 0 0 0 2.624h11.625a1.313 1.313 0 0 0 0-2.624zm-3-3.75a1.313 1.313 0 0 0 0 2.625h11.625a1.313 1.313 0 0 0 0-2.625z\"/></g>",
  },
  vllm: {
    id: "vllm",
    name: "vLLM",
    origin: "simple-icons",
    source: "https://cdn.jsdelivr.net/npm/simple-icons@16.35.0/icons/vllm.svg",
    terms: "https://github.com/vllm-project/media-kit",
    licence: "CC0-1.0 (Simple Icons path data); traced from vllm-project/media-kit vLLM-Logo.svg @79b2ea5. Trademark of the vLLM project.",
    restrictions: "media-kit README: \"Don't modify or distort the logo proportions\"; \"Use the appropriate version for your background (light/dark)\". No explicit recolour ban. Simple Icons draws the path without a colour; it is filled with Simple Icons' recorded brand hex #30A2FF (vLLM blue).",
    retrieved: "2026-10-29",
    viewBox: "0 0 24 24",
    body: "<g fill=\"#30A2FF\"><path d=\"m23.6 0-8.721 4.59L9.829 24h7.41zM9.83 24V5.142H.4Z\"/></g>",
  },
  huggingface: {
    id: "huggingface",
    name: "Hugging Face",
    origin: "brand",
    source: "https://huggingface.co/datasets/huggingface/brand-assets/resolve/main/hf-logo-monochrome.svg?download=true",
    terms: "https://huggingface.co/brand",
    licence: "Official brand asset; the page says \"Download the official Hugging Face brand assets to use in your projects.\" No licence or usage rules published (dataset has no card/licence). Trademark of Hugging Face, Inc.",
    restrictions: "",
    retrieved: "2026-10-29",
    viewBox: "0 0 1500 1500",
    body: "<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M1348.72 1168.37C1360.03 1142.67 1361.13 1113.74 1351.94 1087.55C1361.08 1064.58 1362.52 1038.87 1356.33 1014.97C1353.1 1002.63 1347.95 991.175 1341.12 980.965C1342.52 976.029 1343.6 970.929 1344.36 965.659C1349.44 930.378 1337.38 896.408 1313.59 870.403C1302.83 858.64 1289.91 849.894 1275.97 844.105C1284.44 805.888 1288.9 766.185 1288.9 725.475C1288.9 425.12 1046.33 181.36 746.772 181.36C447.213 181.36 204.644 425.12 204.644 725.475C204.644 767.136 209.317 807.743 218.176 846.781C206.46 852.482 195.618 860.354 186.431 870.403C162.65 896.406 150.585 930.384 155.658 965.659C156.415 970.926 157.505 976.031 158.904 980.965C152.074 991.175 146.922 1002.63 143.692 1014.97C137.445 1038.82 138.958 1064.63 148.078 1087.54C138.888 1113.74 139.992 1142.68 151.301 1168.37C171.605 1214.49 218.813 1243.21 283.614 1269C355.654 1297.68 435.229 1318.64 516.715 1318.64C582.532 1318.64 639.737 1302.62 681.509 1265.68C702.919 1268.26 724.699 1269.59 746.772 1269.59C770.797 1269.59 794.475 1268.02 817.706 1264.97C859.527 1302.39 917.048 1318.64 983.305 1318.64C1065.11 1318.64 1144.1 1297.79 1216.41 1269C1281.21 1243.21 1328.42 1214.49 1348.72 1168.37ZM1201.48 1231.5C1265.52 1206.01 1298.5 1182.26 1311.77 1152.11C1321.11 1130.89 1319.46 1106.41 1307.02 1086.84C1323.52 1061.54 1320.36 1036.98 1317.28 1025.19C1313.34 1010.15 1305.2 997.644 1294.14 988.661C1299.38 979.912 1302.89 970.461 1304.41 959.918C1307.59 937.779 1300.28 915.653 1283.81 897.648C1278.56 891.903 1272.36 887.26 1265.59 883.763C1253.45 877.49 1239.44 874.904 1225.67 876.26C1229.83 862.94 1233.45 849.38 1236.51 835.609C1244.38 800.161 1248.53 763.306 1248.53 725.476C1248.53 447.262 1023.89 221.726 746.772 221.726C469.656 221.726 245.01 447.262 245.01 725.476C245.01 763.44 249.193 800.424 257.122 835.988C260.135 849.506 263.69 862.818 267.762 875.901C254.074 875.791 240.392 879.604 228.93 886.961C224.276 889.948 219.988 893.519 216.214 897.648C199.743 915.653 192.427 937.779 195.613 959.918C197.128 970.461 200.637 979.912 205.881 988.661C194.823 997.644 186.678 1010.15 182.742 1025.19C179.66 1036.98 176.501 1061.54 192.997 1086.84C180.564 1106.41 178.908 1130.89 188.245 1152.11C201.517 1182.26 234.498 1206.01 298.542 1231.5C367.636 1259 441.978 1278.27 516.715 1278.27C584.432 1278.27 634.963 1259.67 667.239 1222.93C693.142 1227.07 719.707 1229.23 746.772 1229.23C775.811 1229.23 804.275 1226.75 831.964 1221.99C864.201 1259.36 915.014 1278.28 983.305 1278.28C1058.36 1278.28 1132.11 1259.11 1201.48 1231.5Z\" fill=\"black\"/><path d=\"M635.221 1179.69C670.856 1127.23 668.331 1087.85 619.437 1038.79C570.542 989.739 542.081 917.979 542.081 917.979C542.081 917.979 531.45 876.301 507.236 880.136C483.022 883.971 465.244 946.254 515.964 984.357C566.684 1022.45 505.864 1048.33 486.35 1012.55C466.836 976.778 413.552 884.803 385.92 867.214C358.3 849.625 338.851 859.479 345.365 895.736C351.878 931.993 467.393 1019.87 456.154 1038.89C444.914 1057.9 405.304 1016.55 405.304 1016.55C405.304 1016.55 281.359 903.302 254.374 932.812C227.389 962.322 274.846 987.048 342.477 1028.15C410.121 1069.25 415.365 1080.1 405.77 1095.65C396.162 1111.2 246.864 984.825 232.84 1038.4C218.83 1091.97 385.208 1107.52 374.939 1144.5C364.671 1181.5 257.741 1074.5 235.87 1116.19C213.987 1157.89 386.762 1206.89 388.16 1207.25C443.969 1221.79 585.705 1252.59 635.221 1179.69Z\" fill=\"black\"/><path d=\"M864.806 1179.69C829.171 1127.23 831.696 1087.85 880.591 1038.79C929.485 989.739 957.946 917.979 957.946 917.979C957.946 917.979 968.577 876.301 992.791 880.136C1017.01 883.971 1034.78 946.254 984.064 984.357C933.344 1022.45 994.164 1048.33 1013.68 1012.55C1033.19 976.778 1086.47 884.803 1114.11 867.214C1141.73 849.625 1161.18 859.479 1154.66 895.736C1148.15 931.993 1032.63 1019.87 1043.87 1038.89C1055.11 1057.9 1094.72 1016.55 1094.72 1016.55C1094.72 1016.55 1218.67 903.302 1245.65 932.812C1272.64 962.322 1225.18 987.048 1157.55 1028.15C1089.91 1069.25 1084.66 1080.1 1094.26 1095.65C1103.87 1111.2 1253.16 984.825 1267.19 1038.4C1281.2 1091.97 1114.82 1107.52 1125.09 1144.5C1135.36 1181.5 1242.29 1074.5 1264.16 1116.19C1286.04 1157.89 1113.27 1206.89 1111.87 1207.25C1056.06 1221.79 914.322 1252.59 864.806 1179.69Z\" fill=\"black\"/><path d=\"M675.913 853.201C679.674 855.39 683.766 857.524 688.891 860.001C705.59 868.074 725.878 873.106 750.564 873.106C777.366 873.106 799.015 867.175 816.53 857.819C821.193 855.328 825.305 852.779 828.701 850.52C818.286 841.142 806.116 833.688 792.747 828.717C791.172 828.131 789.58 827.58 787.973 827.064C782.46 825.295 776.761 834.148 770.915 843.232C765.317 851.929 759.582 860.838 753.744 860.838C748.268 860.838 742.882 851.802 737.615 842.964C732.157 833.804 726.824 824.857 721.649 826.403C704.266 831.599 688.648 840.906 675.913 853.201Z\" fill=\"black\"/><path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M849.695 285.599C816.641 277.833 782.184 273.727 746.772 273.727C684.644 273.727 625.458 286.368 571.624 309.227C448.998 361.299 354.15 466.394 315.593 595.883C303.37 636.933 296.805 680.435 296.805 725.476C296.805 761.974 301.116 797.461 309.255 831.452C309.366 831.317 309.477 831.183 309.587 831.05C322.652 815.372 341.389 806.727 362.353 806.727C379.135 806.727 396.395 812.304 413.669 823.302C425.128 830.608 437.792 843.556 450.832 859.832C462.913 843.01 479.824 831.83 499.169 828.775C502.872 828.19 506.628 827.891 510.344 827.891H510.357C554.525 827.891 581.096 866.358 591.144 900.964C596.129 912.651 620.058 965.899 656.056 1002.01C710.873 1057.01 724.595 1113.75 697.461 1174.54C713.655 1176.32 730.108 1177.23 746.772 1177.23C747.445 1177.23 748.117 1177.22 748.789 1177.22L749.307 1177.22L750.29 1177.21C767.865 1177.08 785.2 1175.93 802.241 1173.83C775.534 1113.31 789.363 1056.8 843.964 1002.01C879.962 965.899 903.891 912.651 908.876 900.964C918.924 866.358 945.495 827.891 989.663 827.891H989.676C993.392 827.891 997.147 828.19 1000.85 828.775C1020.2 831.83 1037.11 843.01 1049.19 859.832C1062.23 843.556 1074.89 830.608 1086.35 823.302C1103.62 812.304 1120.89 806.727 1137.67 806.727C1156.17 806.727 1172.94 813.46 1185.6 825.819C1192.89 793.547 1196.74 759.963 1196.74 725.476C1196.74 709.883 1195.95 694.474 1194.42 679.288C1174.88 486.115 1034.11 328.922 849.695 285.599ZM652.93 884.744C603.394 843.337 581.677 781.979 581.677 742.068C581.677 711.101 602.797 721.605 636.467 738.35C666.402 753.238 706.256 773.059 750.01 773.059C793.763 773.059 833.618 753.238 863.553 738.35C897.223 721.605 918.343 711.101 918.343 742.068C918.343 780.4 900.71 842.529 852.745 880.809C827.567 900.728 794.093 914.485 750.509 914.485C709.56 914.485 677.534 902.691 652.93 884.744ZM919.726 619.809C914.761 612.591 909.541 605.002 902.523 602.514C896.04 600.216 887.549 603.626 879.395 606.901C868.994 611.078 859.142 615.035 854.701 606.649C837.914 574.953 849.899 535.595 881.471 518.742C913.042 501.889 952.244 513.922 969.031 545.618C985.818 577.315 973.833 616.672 942.261 633.525C932.68 638.64 926.437 629.564 919.726 619.809ZM597.494 602.514C590.477 605.002 585.256 612.591 580.291 619.809C573.581 629.564 567.337 638.64 557.756 633.525C526.185 616.672 514.2 577.315 530.986 545.618C547.773 513.922 586.975 501.889 618.547 518.742C650.118 535.595 662.103 574.953 645.317 606.649C640.876 615.035 631.023 611.078 620.623 606.901C612.468 603.626 603.977 600.216 597.494 602.514ZM1093.15 621.477C1093.15 644.811 1074.31 663.727 1051.07 663.727C1027.83 663.727 1008.98 644.811 1008.98 621.477C1008.98 598.143 1027.83 579.227 1051.07 579.227C1074.31 579.227 1093.15 598.143 1093.15 621.477ZM448.95 663.727C472.192 663.727 491.033 644.811 491.033 621.477C491.033 598.143 472.192 579.227 448.95 579.227C425.708 579.227 406.866 598.143 406.866 621.477C406.866 644.811 425.708 663.727 448.95 663.727Z\" fill=\"black\"/>",
  },
  mlx: {
    id: "mlx",
    name: "MLX",
    origin: "brand",
    source: "https://raw.githubusercontent.com/ml-explore/mlx/main/docs/logo/mlx_logo.svg",
    terms: "https://github.com/ml-explore/mlx",
    licence: "File is in the MIT-licensed ml-explore/mlx repo (docs/logo, added in #3308). MIT covers copyright only; marks belong to Apple.",
    restrictions: "No logo usage guidelines published in the repo.",
    retrieved: "2026-10-29",
    viewBox: "0 0 433.19 139.72",
    body: "<defs><g><g><path d=\"M 9.6875 -171.1875 L 188.609375 -171.1875 L 188.609375 -188.8125 L 9.6875 -188.8125 Z M 9.6875 -127.421875 L 188.609375 -127.421875 L 188.609375 -145.046875 L 9.6875 -145.046875 Z M 9.6875 -83.5625 L 188.609375 -83.5625 L 188.609375 -101.1875 L 9.6875 -101.1875 Z M 9.6875 -39.796875 L 188.609375 -39.796875 L 188.609375 -57.421875 L 9.6875 -57.421875 Z M 9.6875 4.0625 L 188.609375 4.0625 L 188.609375 -13.5625 L 9.6875 -13.5625 Z M 9.6875 47.828125 L 188.609375 47.828125 L 188.609375 30.203125 L 9.6875 30.203125 Z M 9.6875 47.828125 \"/></g><g id=\"af-brand-mlx-glyph-0-1\"><path d=\"M 13.9375 0 L 42.3125 0 L 42.3125 -91.796875 L 43.671875 -91.796875 L 78.71875 0 L 97.984375 0 L 133.03125 -91.796875 L 134.390625 -91.796875 L 134.390625 0 L 162.765625 0 L 162.765625 -139.71875 L 125.96875 -139.71875 L 88.984375 -42.015625 L 87.8125 -42.015625 L 50.734375 -139.71875 L 13.9375 -139.71875 Z M 13.9375 0 \"/></g><g id=\"af-brand-mlx-glyph-0-2\"><path d=\"M 13.9375 0 L 106.21875 0 L 106.21875 -26.046875 L 45.984375 -26.046875 L 45.984375 -139.71875 L 13.9375 -139.71875 Z M 13.9375 0 \"/></g><g id=\"af-brand-mlx-glyph-0-3\"><path d=\"M 6.296875 0 L 40.5625 0 L 69.515625 -47.34375 L 70.484375 -47.34375 L 99.625 0 L 135.84375 0 L 91.109375 -69.8125 L 91.109375 -70.296875 L 136.328125 -139.71875 L 100.703125 -139.71875 L 73 -90.71875 L 71.84375 -90.71875 L 43.953125 -139.71875 L 6.484375 -139.71875 L 49.96875 -70.6875 L 49.96875 -70.296875 Z M 6.296875 0 \"/></g></g><clipPath id=\"af-brand-mlx-clip-0\"><path clip-rule=\"nonzero\" d=\"M 13 0 L 283 0 L 283 139.71875 L 13 139.71875 Z M 13 0 \"/></clipPath><clipPath id=\"af-brand-mlx-clip-1\"><path clip-rule=\"nonzero\" d=\"M 296 0 L 427 0 L 427 139.71875 L 296 139.71875 Z M 296 0 \"/></clipPath></defs><g clip-path=\"url(#af-brand-mlx-clip-0)\"><g fill=\"rgb(0%, 0%, 0%)\" fill-opacity=\"1\"><use href=\"#af-brand-mlx-glyph-0-1\" x=\"0\" y=\"139.72\"/><use href=\"#af-brand-mlx-glyph-0-2\" x=\"176.682092\" y=\"139.72\"/></g></g><g clip-path=\"url(#af-brand-mlx-clip-1)\"><g fill=\"rgb(82.998657%, 82.998657%, 82.998657%)\" fill-opacity=\"1\"><use href=\"#af-brand-mlx-glyph-0-3\" x=\"290.57\" y=\"139.72\"/></g></g>",
  },
  llamacpp: {
    id: "llamacpp",
    name: "llama.cpp",
    origin: "brand",
    source: "https://raw.githubusercontent.com/ggml-org/llama.cpp/master/media/llama1-icon-transparent.svg",
    terms: "https://github.com/ggml-org/llama.cpp/blob/master/LICENSE",
    licence: "File is in the MIT-licensed ggml-org/llama.cpp repo (media/, added in #15891). MIT covers copyright; trademark of the ggml-org/llama.cpp project.",
    restrictions: "No logo usage guidelines published.",
    retrieved: "2026-10-29",
    viewBox: "0 0 250 250",
    body: "<defs/><g transform=\"translate(-995.51066,-129.70875)\"><path fill=\"#ff8236\" d=\"m 1163.3,226.8 -13.5,24 c -17.8,-13.7 -44.2,-15.7 -62,-1 -28.7,23.7 -26.7,78.5 18,78.8 12.5,0 23.1,-5.9 34.5,-9.8 l 6,23.9 c -10.1,4.7 -20.4,9.5 -31.5,11 -101.2,13.8 -95.4,-132.3 -3.9,-139.9 19.2,-1.6 36.1,3.4 52.5,13 z\"/><path fill=\"#ff8236\" d=\"m 1093.4,203.8 c -15.4,4.6 -29.7,13.1 -40.5,25 -2,-24.2 3.4,-73.1 30.3,-82.7 4,-1.4 17.7,-4.9 17.3,2.2 -0.4,7.1 -9.9,19.3 -12.2,25.9 -4,11.6 -0.3,19.6 5.2,29.7 z\"/><polygon fill=\"#ff8236\" points=\"1131.4,307.8 1116.4,307.8 1116.4,290.8 1099.4,290.8 1099.4,276.8 1114.9,276.8 1116.4,275.3 1116.4,258.8 1131.4,258.8 1131.4,276.8 1147.4,276.8 1147.4,290.8 1131.4,290.8 \"/><polygon fill=\"#ff8236\" points=\"1186.4,290.8 1186.4,307.8 1171.4,307.8 1171.4,290.8 1155.4,290.8 1155.4,276.8 1171.4,276.8 1171.4,258.8 1186.4,258.8 1186.4,275.3 1187.9,276.8 1203.4,276.8 1203.4,290.8 \"/><path fill=\"#ff8236\" d=\"m 1142.3,156.9 c 2,3 -9.3,15.9 -11.1,19.2 -5.2,9.8 -1.7,15.4 2.2,24.7 -11.3,-1.7 -21.8,-0.3 -33,1 2.5,-21.5 14.6,-52.8 41.9,-44.9 z\"/></g>",
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    origin: "brand",
    source: "https://openrouter.ai/brand/logos/transparent/glyph/svg/glyph-ink.svg",
    terms: "https://openrouter.ai/brand",
    licence: "Official brand asset offered \"ready to use\"; no permission step or licence stated. Trademark of OpenRouter, Inc.",
    restrictions: "\"Please don't stretch, recolor, or remix the marks.\" Approved colourways only: Ink #03080A (light backgrounds) and Cloud #FCFCFE (dark backgrounds), plus Grape/Volt.",
    retrieved: "2026-10-29",
    viewBox: "0 0 1024 730",
    body: "<path d=\"M795.893 0C915.776 0 1012.95 97.9963 1012.95 218.88C1012.95 339.764 915.776 437.76 795.893 437.76L1011.2 654.869C1038.55 682.447 1019.18 729.6 980.504 729.6H361.77C161.97 729.6 0 566.273 0 364.8C0 163.327 161.97 0 361.77 0L795.893 0ZM361.77 145.92C241.89 145.92 144.708 243.916 144.708 364.8C144.708 485.684 241.89 583.68 361.77 583.68C481.649 583.68 578.831 485.684 578.831 364.8C578.831 243.916 481.649 145.92 361.77 145.92Z\" fill=\"#03080A\"/>",
  },
};

export const BRAND_FALLBACKS: Readonly<Record<string, BrandFallback>> = {
  openai: {
    id: "openai",
    name: "OpenAI",
    text: "OAI",
    terms: "https://openai.com/brand/",
    reason: "OpenAI's brand terms forbid it without permission: \"Use the logo exactly as provided\"; Don't \"Use the logo without permission or outside OpenAI's terms\"; Don't \"modify it in any way\"; Blossom: \"DON'T add any colors to the Blossom\"; \"The permission we grant is non-exclusive (we can give it to others) and non-transferrable (you cannot give it to others).\"",
    retrieved: "2026-10-29",
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    text: "ANT",
    terms: "https://www.anthropic.com/legal/trademark-guidelines",
    reason: "Anthropic's trademark guidelines need its approval first: \"You may only use our trademarks as specifically permitted by us and only in materials we approve beforehand.\" and \"No alterations of our trademarks (changes to color, font, proportion, or otherwise) are permitted.\"",
    retrieved: "2026-10-29",
  },
  portkey: {
    id: "portkey",
    name: "Portkey",
    text: "PK",
    terms: "https://portkey.ai/",
    reason: "No usable logo: no brand kit, brand guidelines or licensed logo file found (portkey.ai/brand, /press, /brand-assets, /media-kit all 404; Portkey-AI/gateway repo (MIT) has no logo file).",
    retrieved: "2026-10-29",
  },
  "openai-compatible": {
    id: "openai-compatible",
    name: "OpenAI-compatible server",
    text: "API",
    terms: "",
    reason: "A protocol, not a brand: any server that speaks the OpenAI API (vLLM, llama.cpp, LocalAI, a private gateway). No logo applies.",
    retrieved: "2026-10-29",
  },
};

/** The ids the provider cards name: the gateway's engine cards and AbstractCore's cloud providers. */
export const BRAND_CARD_IDS = {
  engines: ["ollama", "lmstudio", "vllm", "huggingface", "mlx", "llamacpp"],
  providers: ["openai", "anthropic", "openrouter", "portkey", "openai-compatible"],
} as const;

export type BrandMarkInfo =
  | { kind: "icon"; icon: BrandIcon }
  | { kind: "text"; fallback: BrandFallback }
  | { kind: "unknown"; text: string };

const key = (id: string) => String(id || "").trim().toLowerCase();

/** The mark of `id`: its icon, its documented text badge, or (an id nobody listed) its initials. */
export function brandMarkInfo(id: string, name?: string): BrandMarkInfo {
  const k = key(id);
  if (Object.prototype.hasOwnProperty.call(BRAND_ICONS, k)) return { kind: "icon", icon: BRAND_ICONS[k] };
  if (Object.prototype.hasOwnProperty.call(BRAND_FALLBACKS, k)) return { kind: "text", fallback: BRAND_FALLBACKS[k] };
  const label = String(name || id || "?").replace(/[^A-Za-z0-9]/g, "");
  return { kind: "unknown", text: (label.slice(0, 2) || "?").replace(/^./, (c) => c.toUpperCase()) };
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/** The SVG of a mark (inline, no external reference), or "" for an id without a logo. */
export function brandIconSvg(id: string): string {
  const info = brandMarkInfo(id);
  if (info.kind !== "icon") return "";
  return `<svg viewBox="${info.icon.viewBox}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${info.icon.body}</svg>`;
}

/**
 * The mark as HTML, for hosts that build markup as strings (the gateway console's engine cards):
 * `<span class="af-brand-mark" data-brand="ollama" role="img" aria-label="Ollama">…</span>`.
 */
export function brandMarkHtml(id: string, name?: string): string {
  const info = brandMarkInfo(id, name);
  const label = escapeHtml(String(name || (info.kind === "icon" ? info.icon.name : info.kind === "text" ? info.fallback.name : id) || id));
  const k = escapeHtml(key(id));
  if (info.kind === "icon") return `<span class="af-brand-mark" data-brand="${k}" role="img" aria-label="${label}">${brandIconSvg(id)}</span>`;
  const text = escapeHtml(info.kind === "text" ? info.fallback.text : info.text);
  return `<span class="af-brand-mark af-brand-mark--text" data-brand="${k}" role="img" aria-label="${label}">${text}</span>`;
}

export function BrandMark(props: { id: string; name?: string; className?: string }): React.ReactElement {
  const info = brandMarkInfo(props.id, props.name);
  const k = key(props.id);
  const label = props.name || (info.kind === "icon" ? info.icon.name : info.kind === "text" ? info.fallback.name : props.id);
  if (info.kind === "icon") {
    return (
      <span className={`af-brand-mark${props.className ? ` ${props.className}` : ""}`} data-brand={k} role="img" aria-label={label}
        dangerouslySetInnerHTML={{ __html: brandIconSvg(k) }} />
    );
  }
  return (
    <span className={`af-brand-mark af-brand-mark--text${props.className ? ` ${props.className}` : ""}`} data-brand={k} role="img" aria-label={label}>
      {info.kind === "text" ? info.fallback.text : info.text}
    </span>
  );
}
