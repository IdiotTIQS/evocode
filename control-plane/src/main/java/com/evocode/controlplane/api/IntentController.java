// api/IntentController.java
package com.evocode.controlplane.api;

import com.evocode.controlplane.client.PythonRuntimeClient;
import com.evocode.controlplane.dto.IntentRequest;
import com.evocode.controlplane.dto.RunResult;
import com.evocode.controlplane.persistence.RunStore;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/intents")
public class IntentController {

    private final PythonRuntimeClient runtimeClient;
    private final RunStore runStore;

    public IntentController(PythonRuntimeClient runtimeClient, RunStore runStore) {
        this.runtimeClient = runtimeClient;
        this.runStore = runStore;
    }

    @PostMapping
    public RunResult submit(@Valid @RequestBody IntentRequest request) {
        RunResult result = runtimeClient.createRun(request);
        runStore.save(request, result);  // 旁路持久化；save 内部已吞异常
        return result;
    }
}
