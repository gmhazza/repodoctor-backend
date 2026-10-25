import { analyzerService } from '../services/analyzer.service.js';

export class AnalyzeController {
  constructor(service = analyzerService) {
    this.analyzerService = service;
  }

  analyze = async (req, res, next) => {
    try {
      const { repository } = req.body;
      const result = await this.analyzerService.analyzeRepository(repository);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}

export const analyzeController = new AnalyzeController();
