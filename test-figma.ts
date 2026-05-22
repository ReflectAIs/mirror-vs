import { FigmaService } from './src/services/figma-service';

async function test() {
  const fs = new FigmaService();
  const token = process.env.FIGMA_TOKEN || 'invalid_token_for_test';
  try {
    const res = await fs.getSimplifiedNode('6SsVL4qkRQyp2Lk3Eznbgu', '1:11', token);
    console.log(res);
  } catch (err) {
    console.error("Caught error:", err);
  }
}

test();
