package com.evocode.controlplane.api;

import com.evocode.controlplane.client.PythonRuntimeClient;
import com.evocode.controlplane.dto.IntentRequest;
import com.evocode.controlplane.dto.RunAcknowledgement;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/intents")
public class IntentController {

    private final PythonRuntimeClient runtimeClient;

    public IntentController(PythonRuntimeClient runtimeClient) {
        this.runtimeClient = runtimeClient;
    }

    @PostMapping
    public RunAcknowledgement submit(@Valid @RequestBody IntentRequest request) {
        // 增量 0：直转 Python 运行时。后续此处接入编排/鉴权/RBAC。
        return runtimeClient.createRun(request);
    }
}
